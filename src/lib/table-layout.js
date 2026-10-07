export function tableCellSpan(block, row, column) {
    if (!block.cellSpans) {
        return {
            rowSpan: 1,
            colSpan: 1,
        };
    }
    const span = block.cellSpans.find((cell) => cell.row === row && cell.column === column);
    if (span) {
        return span;
    }
    const covered = block.cellSpans.some((cell) => row >= cell.row && row < cell.row + cell.rowSpan &&
        column >= cell.column && column < cell.column + cell.colSpan);
    return covered ? null : {
        rowSpan: 1,
        colSpan: 1,
    };
}

export function appendTableRow(block) {
    const row = Array(block.columns.length).fill('');
    return {
        ...block,
        rows: [...block.rows, row],
        cellSpans: block.cellSpans && [...block.cellSpans, ...row.map((_, column) => ({
            row: block.rows.length,
            column,
            rowSpan: 1,
            colSpan: 1,
        }))],
    };
}

export function removeTableRow(block, index) {
    if (!Number.isInteger(index) || index < 0 || index >= block.rows.length) {
        return block;
    }
    const rows = block.rows.filter((_, row) => row !== index).map((row) => [...row]);
    const cellSpans = block.cellSpans?.flatMap((cell) => {
        if (cell.row > index) {
            return [{
                ...cell,
                row: cell.row - 1,
            }];
        }
        if (cell.row <= index && cell.row + cell.rowSpan > index) {
            if (cell.rowSpan === 1) {
                return [];
            }
            if (cell.row === index) {
                rows[index][cell.column] = block.rows[index][cell.column];
            }
            return [{
                ...cell,
                rowSpan: cell.rowSpan - 1,
            }];
        }
        return [cell];
    });
    return {
        ...block,
        rows,
        cellSpans,
    };
}

export function appendTableColumn(block) {
    const count = block.columns.length;
    return {
        ...block,
        columns: [...block.columns, `Columna ${count + 1}`],
        rows: block.rows.map((row) => [...row, '']),
        cellSpans: block.cellSpans && [...block.cellSpans, ...block.rows.map((_, row) => ({
            row,
            column: count,
            rowSpan: 1,
            colSpan: 1,
        }))],
        columnWidths: block.columnWidths && [...block.columnWidths.map((width) => width * count / (count + 1)), 100 / (count + 1)],
    };
}
