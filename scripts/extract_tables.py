"""Read ruled PDF tables from painted borders and positioned words (no OCR)."""
import json
import sys
import xml.etree.ElementTree as ET
from collections import Counter
import pikepdf
from export_original import multiply, IDENTITY


def clustered(values):
    result = []
    for value in sorted(values):
        if not result or value - result[-1] > 1.5:
            result.append(value)
    return result


def geometry(page):
    height = float(page.MediaBox[3])
    matrix, stack, pending, segments = IDENTITY, [], [], []
    color = '#000000'
    rectangles = []
    fills = []
    point = None
    def transform(x, y):
        a, b, c, d, e, f = matrix
        return a*x+c*y+e, height-(b*x+d*y+f)
    def edge(a, b):
        if abs(a[0]-b[0]) < 1 and abs(a[1]-b[1]) > 3:
            pending.append(('v', (a[0]+b[0])/2, min(a[1], b[1]), max(a[1], b[1])))
        elif abs(a[1]-b[1]) < 1 and abs(a[0]-b[0]) > 3:
            pending.append(('h', (a[1]+b[1])/2, min(a[0], b[0]), max(a[0], b[0])))
    for args, op in pikepdf.parse_content_stream(page):
        op = str(op)
        if op == 'q': stack.append((matrix,color))
        elif op == 'Q': matrix,color = stack.pop() if stack else (IDENTITY,'#000000')
        elif op == 'cm': matrix = multiply(matrix, tuple(map(float, args)))
        elif op in ('g','rg','sc','scn') and len(args) in (1,3):
            try:
                channels = list(map(float,args))
                if len(channels)==1: channels *= 3
                color = '#' + ''.join(f'{round(max(0,min(1,value))*255):02x}' for value in channels)
            except (TypeError,ValueError): pass
        elif op == 'm': point = transform(*map(float, args))
        elif op == 'l':
            target = transform(*map(float, args))
            if point: edge(point, target)
            point = target
        elif op == 're':
            x, y, w, h = map(float, args)
            corners = [transform(x,y), transform(x+w,y), transform(x+w,y+h), transform(x,y+h)]
            if min(abs(w), abs(h)) < 2:
                edge(corners[0], corners[2])
            else:
                rectangles.append(corners)
        elif op in ('S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*'):
            if op in ('S', 's', 'B', 'B*', 'b', 'b*'):
                for corners in rectangles:
                    for i in range(4): edge(corners[i], corners[(i+1)%4])
            if op in ('f', 'F', 'f*', 'B', 'B*', 'b', 'b*'):
                fills.extend((corners,color) for corners in rectangles)
            segments.extend(pending); pending = []; rectangles = []
        elif op == 'n': pending = []; rectangles = []
    # Border fragments are connected at corners; distant tables stay separate.
    groups = []
    def intersects(a,b):
        if a[0] == b[0]: return abs(a[1]-b[1]) < 1.5 and max(a[2],b[2]) <= min(a[3],b[3])+1.5
        h,v = (a,b) if a[0]=='h' else (b,a)
        return h[2]-1.5 <= v[1] <= h[3]+1.5 and v[2]-1.5 <= h[1] <= v[3]+1.5
    for segment in segments:
        matches = [g for g in groups if any(intersects(segment,s) for s in g)]
        merged = [segment]
        for group in matches:
            merged.extend(group); groups.remove(group)
        groups.append(merged)
    tables = []
    for group in groups:
        xs = clustered(s[1] for s in group if s[0]=='v')
        ys = clustered(s[1] for s in group if s[0]=='h')
        if len(xs)<3 or len(ys)<2 or len(xs)>41 or len(ys)>5001: continue
        if xs[-1]-xs[0]<50: continue
        # Some rowspan borders are painted only alongside the first sub-row.
        # A filled cell rectangle supplies the remaining boundary. Use only
        # coordinates already established by actual borders: text highlights
        # and padding must never introduce new columns or rows.
        for corners,fill_color in fills:
            x0, x1 = min(p[0] for p in corners), max(p[0] for p in corners)
            y0, y1 = min(p[1] for p in corners), max(p[1] for p in corners)
            snapped = [min(axis, key=lambda v: abs(v-value))
                       for axis,value in ((xs,x0),(xs,x1),(ys,y0),(ys,y1))]
            if any(abs(a-b)>1.5 for a,b in zip(snapped,(x0,x1,y0,y1))): continue
            left,right,top,bottom = snapped
            if left==right or top==bottom: continue
            group.extend([('v',left,top,bottom),('v',right,top,bottom),
                          ('h',top,left,right),('h',bottom,left,right)])
        def border(kind, coordinate, start, end):
            parts = sorted((s[2],s[3]) for s in group if s[0]==kind and abs(s[1]-coordinate)<1.5)
            cursor = start
            for left,right in parts:
                if left > cursor+1.5: continue
                cursor = max(cursor,right)
            return cursor >= end-1.5
        nr,nc = len(ys)-1,len(xs)-1
        parent = list(range(nr*nc))
        def root(i):
            while parent[i]!=i: i=parent[i]
            return i
        def union(a,b): parent[root(b)] = root(a)
        for r in range(nr):
            for c in range(nc):
                if c+1<nc and not border('v',xs[c+1],ys[r],ys[r+1]): union(r*nc+c,r*nc+c+1)
                if r+1<nr and not border('h',ys[r+1],xs[c],xs[c+1]): union(r*nc+c,(r+1)*nc+c)
        regions = {}
        for r in range(nr):
            for c in range(nc): regions.setdefault(root(r*nc+c),[]).append((r,c))
        cells = []
        for region in regions.values():
            r0,c0 = min(r for r,c in region),min(c for r,c in region)
            r1,c1 = max(r for r,c in region)+1,max(c for r,c in region)+1
            if len(region)!=(r1-r0)*(c1-c0): break
            bbox=[xs[c0],ys[r0],xs[c1],ys[r1]]
            backgrounds=[]
            for corners,fill_color in fills:
                rect=[min(p[0] for p in corners),min(p[1] for p in corners),max(p[0] for p in corners),max(p[1] for p in corners)]
                if all(abs(a-b)<1.5 for a,b in zip(rect,bbox)):
                    backgrounds.append((rect,fill_color))
            background=backgrounds[-1][1] if backgrounds else '#ffffff'
            cells.append(dict(row=r0,column=c0,rowSpan=r1-r0,colSpan=c1-c0,bbox=bbox,background=background,words=[]))
        else:
            tables.append(dict(xs=xs,ys=ys,cells=cells))
    return tables


def main():
    source = json.load(open(sys.argv[3], encoding="utf-8"))
    pdf = pikepdf.open(sys.argv[1])
    xml = ET.parse(sys.argv[2])
    pages = xml.findall('.//{*}page')
    result = []
    for index,page in enumerate(pdf.pages):
        tables = geometry(page)
        words = []
        for element in pages[index].findall('.//{*}word'):
            word = dict(text=element.text or '',x=(float(element.attrib['xMin'])+float(element.attrib['xMax']))/2,y=(float(element.attrib['yMin'])+float(element.attrib['yMax']))/2,table=None)
            for ti,table in enumerate(tables):
                for cell in table['cells']:
                    x0,y0,x1,y1=cell['bbox']
                    if x0-1<=word['x']<=x1+1 and y0-1<=word['y']<=y1+1:
                        cell['words'].append(word);word['table']=ti;break
                if word['table'] is not None: break
            words.append(word)
        # Match every layout line to positioned words, keeping its stable source id.
        available = set(range(len(words)))
        refs = [[] for _ in tables]
        for line in source[index]['lines']:
            selected=[]; anchor=None
            for token in line['text'].split():
                candidates=[i for i in available if words[i]['text']==token]
                if not candidates: continue
                wi=min(candidates,key=lambda i:(abs(words[i]['y']-anchor) if anchor is not None else words[i]['y'],words[i]['x']))
                available.remove(wi); selected.append(words[wi]); anchor=anchor if anchor is not None else words[wi]['y']
            assigned={w['table'] for w in selected}
            if len(selected)==len(line['text'].split()) and len(assigned)==1 and None not in assigned:
                refs[next(iter(assigned))].append(line['id'])
        for ti,table in enumerate(tables):
            if not refs[ti]: continue
            rows=[['']*(len(table['xs'])-1) for _ in range(len(table['ys'])-1)]
            spans=[]
            for cell in table['cells']:
                groups=[]
                for w in sorted(cell.pop('words'),key=lambda w:(w['y'],w['x'])):
                    if not groups or abs(groups[-1][0]-w['y'])>2: groups.append([w['y'],[]])
                    groups[-1][1].append(w)
                text='\n'.join(' '.join(w['text'] for w in sorted(g[1],key=lambda w:w['x'])) for g in groups)
                rows[cell['row']][cell['column']]=text
                spans.append({k:cell[k] for k in ('row','column','rowSpan','colSpan','bbox','background')})
            counts=Counter(w['text'] for w in words if w['table']==ti)
            supplied=Counter(token for l in source[index]['lines'] if l['id'] in refs[ti] for token in l['text'].split())
            if counts!=supplied: continue  # Never replace a partially mapped table.
            result.append(dict(id=f"p{index+1}-t{ti+1}",page=index+1,rows=rows,cellSpans=spans,columnWidths=[(b-a)/(table['xs'][-1]-table['xs'][0])*100 for a,b in zip(table['xs'],table['xs'][1:])],sourceRefs=refs[ti]))
    json.dump(result,sys.stdout,ensure_ascii=False)

if __name__=='__main__': main()
