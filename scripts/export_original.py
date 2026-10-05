"""Aplica ediciones sobre las páginas PDF existentes, conservando sus recursos."""

import json
import math
import re
import sys
from pathlib import Path

import pikepdf


IDENTITY = (1, 0, 0, 1, 0, 0)


def multiply(left, right):
    a, b, c, d, e, f = left
    g, h, i, j, k, l = right
    return (a * g + c * h, b * g + d * h, a * i + c * j,
            b * i + d * j, a * k + c * l + e, b * k + d * l + f)


def unicode_map(font):
    mapping = {}
    if "/ToUnicode" not in font:
        return {bytes([code]): bytes([code]).decode("cp1252", errors="replace") for code in range(256)}
    content = font.ToUnicode.read_bytes().decode("latin1")
    for block in re.findall(r"beginbfchar(.*?)endbfchar", content, re.S):
        for original, unicode in re.findall(r"<([0-9a-f]+)>\s*<([0-9a-f]+)>", block, re.I):
            mapping[bytes.fromhex(original)] = bytes.fromhex(unicode).decode("utf-16-be")
    for block in re.findall(r"beginbfrange(.*?)endbfrange", content, re.S):
        for start, end, destination, array in re.findall(
                r"<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*(?:<([0-9a-f]+)>|\[(.*?)\])", block, re.I | re.S):
            first, last = int(start, 16), int(end, 16)
            destinations = re.findall(r"<([0-9a-f]+)>", array)
            for offset, code in enumerate(range(first, last + 1)):
                value = destinations[offset] if destinations else format(int(destination, 16) + offset, "0" + str(len(destination)) + "x")
                mapping[code.to_bytes(len(start) // 2, "big")] = bytes.fromhex(value).decode("utf-16-be")
    return mapping


def font_metrics(font):
    widths = {}
    descendant = font.DescendantFonts[0] if "/DescendantFonts" in font else font
    if "/W" in descendant:
        values = list(descendant.W)
        index = 0
        while index < len(values):
            first = int(values[index])
            second = values[index + 1]
            if isinstance(second, pikepdf.Array):
                for offset, width in enumerate(second):
                    widths[first + offset] = float(width)
                index += 2
            else:
                last, width = int(second), float(values[index + 2])
                for code in range(first, last + 1):
                    widths[code] = width
                index += 3
    elif "/Widths" in font:
        widths = {int(font.FirstChar) + offset: float(width) for offset, width in enumerate(font.Widths)}
    return widths, float(descendant.get("/DW", 500))


def font_data(font):
    mapping = unicode_map(font)
    widths, default = font_metrics(font)
    return {"mapping": mapping, "reverse": {value: key for key, value in mapping.items()},
            "length": max((len(code) for code in mapping), default=1), "widths": widths, "default": default}


def decode(raw, data):
    return "".join(data["mapping"].get(raw[index:index + data["length"]], "�")
                   for index in range(0, len(raw), data["length"]))


def encode(text, data):
    try:
        return b"".join(data["reverse"][character] for character in text)
    except KeyError as error:
        raise ValueError(f"La fuente original no contiene el carácter {error.args[0]!r}. Usa un carácter disponible o la plantilla institucional.") from error


def text_width(raw, data):
    return sum(data["widths"].get(int.from_bytes(raw[index:index + data["length"]], "big"), data["default"])
               for index in range(0, len(raw), data["length"])) / 1000


def normalize(text):
    return " ".join(text.split())


def patch_page(pdf, page, patches):
    if not patches:
        return
    if int(page.get("/Rotate", 0)) % 360:
        raise ValueError("La página está girada. Normaliza su orientación antes de editar su diseño original.")
    height = float(page.MediaBox[3])
    fonts = {str(name): font_data(font) for name, font in page.Resources.Font.items()}
    state = {"ctm": IDENTITY, "tm": IDENTITY, "font": None, "size": 1, "spacing": 0, "word_spacing": 0, "scale": 1, "leading": 0}
    stack = []
    commands = []
    matches = {index: {"text": "", "origin": None} for index in range(len(patches))}
    for instruction in pikepdf.parse_content_stream(page):
        if not hasattr(instruction, "operator"):
            commands.append(instruction)
            continue
        operator = str(instruction.operator)
        operands = instruction.operands
        if operator == "q":
            stack.append(dict(state))
        elif operator == "Q" and stack:
            state = stack.pop()
        elif operator == "cm":
            state["ctm"] = multiply(state["ctm"], tuple(float(value) for value in operands))
        elif operator == "BT":
            state["tm"] = IDENTITY
        elif operator == "Tm":
            state["tm"] = tuple(float(value) for value in operands)
        elif operator in ("Td", "TD"):
            state["tm"] = multiply(state["tm"], (1, 0, 0, 1, float(operands[0]), float(operands[1])))
            if operator == "TD":
                state["leading"] = -float(operands[1])
        elif operator == "T*":
            state["tm"] = multiply(state["tm"], (1, 0, 0, 1, 0, -state["leading"]))
        elif operator == "Tf":
            state["font"], state["size"] = str(operands[0]), float(operands[1])
        elif operator == "Tc":
            state["spacing"] = float(operands[0])
        elif operator == "Tw":
            state["word_spacing"] = float(operands[0])
        elif operator == "Tz":
            state["scale"] = float(operands[0]) / 100
        elif operator == "TL":
            state["leading"] = float(operands[0])
        if operator not in ("Tj", "TJ"):
            if operator in ("'", '"'):
                raise ValueError("Esta página usa operadores de texto no compatibles con la edición de posición fija.")
            commands.append(instruction)
            continue
        data = fonts.get(state["font"])
        if not data:
            raise ValueError("No se puede identificar la fuente de una página original.")
        values = list(operands[0]) if operator == "TJ" else [operands[0]]
        strings = [bytes(value) for value in values if isinstance(value, pikepdf.String)]
        decoded = "".join(decode(value, data) for value in strings)
        matrix = multiply(state["ctm"], state["tm"])
        x, y = matrix[4], matrix[5]
        match = next((index for index, patch in enumerate(patches)
                      if patch["left"] - 1.5 <= x < patch["left"] + patch["width"] + .3
                      and patch["top"] - 1 <= height - y <= patch["top"] + patch["height"] + 2), None)
        if match is None:
            commands.append(instruction)
        else:
            matches[match]["text"] += decoded
            if matches[match]["origin"] is None and decoded.strip():
                matches[match]["origin"] = (x, y, state["font"], state["size"] * math.hypot(matrix[0], matrix[1]))
        advance = 0
        for value in values:
            if isinstance(value, pikepdf.String):
                raw = bytes(value)
                advance += text_width(raw, data) * state["size"] + len(raw) / data["length"] * state["spacing"]
                advance += decode(raw, data).count(" ") * state["word_spacing"]
            else:
                advance -= float(value) / 1000 * state["size"]
        state["tm"] = multiply(state["tm"], (1, 0, 0, 1, advance * state["scale"], 0))
    for index, patch in enumerate(patches):
        match = matches[index]
        if normalize(match["text"]) != normalize(patch["originalText"]) or not match["origin"]:
            raise ValueError(f"No se puede reemplazar el texto de la página {patch['page']} con precisión. No se ha generado un PDF incompleto.")
        x, y, font_name, size = match["origin"]
        raw = encode(patch["text"], fonts[font_name])
        width = text_width(raw, fonts[font_name]) * size
        if width > patch["maxWidth"] + 2:
            raise ValueError(f"Una edición de la página {patch['page']} no cabe en su espacio original. Acorta el texto; no se añadirán páginas ni se recortará contenido.")
        color = patch["font"]["color"].lstrip("#")
        rgb = [int(color[offset:offset + 2], 16) / 255 for offset in (0, 2, 4)]
        commands.extend([
            ([], pikepdf.Operator("q")), ([], pikepdf.Operator("BT")),
            ([pikepdf.Name(font_name), size], pikepdf.Operator("Tf")),
            (rgb, pikepdf.Operator("rg")), ([0], pikepdf.Operator("Tc")), ([0], pikepdf.Operator("Tw")),
            ([100], pikepdf.Operator("Tz")), ([1, 0, 0, 1, x, y], pikepdf.Operator("Tm")),
            ([pikepdf.String(raw)], pikepdf.Operator("Tj")),
            ([], pikepdf.Operator("ET")), ([], pikepdf.Operator("Q")),
        ])
    page.Contents = pdf.make_stream(pikepdf.unparse_content_stream(commands))


def main():
    specification = json.loads(Path(sys.argv[1]).read_text())
    result = pikepdf.Pdf.new()
    for source in specification["sources"]:
        with pikepdf.Pdf.open(source["path"]) as original:
            for page_number, page in enumerate(original.pages, 1):
                patches = [patch for patch in source["edits"] if patch["page"] == page_number]
                patch_page(original, page, patches)
            result.pages.extend(original.pages)
    if len(result.pages) != specification["pageCount"]:
        raise ValueError("El número de páginas no coincide con el original.")
    result.save(sys.argv[2])
    print(json.dumps({"pages": len(result.pages)}))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, pikepdf.PdfError) as error:
        print(json.dumps({"error": str(error)}))
        sys.exit(2)
