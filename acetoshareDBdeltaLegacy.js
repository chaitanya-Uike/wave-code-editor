function aceToShareDBDelta(aceDoc, delta) {
    const op = {}
    const start = aceDoc.positionToIndex(delta.start)
    op.p = [shareDBPath, start]

    let operation
    if (delta.action === 'insert')
        operation = 'si'
    else if (delta.action === 'remove')
        operation = 'sd'

    const str = delta.lines.join('\n')

    op[operation] = str

    return op
}

function shareDBToAceDelta(aceDoc, op) {
    const index = op.p[1]
    const pos = aceDoc.indexToPosition(index, 0)
    const start = pos
    let action
    let lines
    let end

    if ('sd' in op) {
        action = 'remove'
        lines = op.sd.split('\n')
        // initialize accumulater with lines.length - 1 to take '\n' into account
        const count = lines.reduce((total, line) => total + line.length, lines.length - 1)
        end = aceDoc.indexToPosition(index + count, 0)
    } else if ('si' in op) {
        action = 'insert'
        lines = op.si.split('\n')
        if (lines.length === 1) {
            end = {
                row: start.row,
                column: start.column + op.si.length,
            }
        } else {
            end = {
                row: start.row + (lines.length - 1),
                column: lines[lines.length - 1].length,
            }
        }
    }

    const delta = {
        start,
        end,
        action,
        lines,
    }

    return delta;
}

function applyOps(aceDoc, ops) {
    // converts the ops provided by shareDB doc 'op' event to Ace delta and applies them
    const deltas = ops.map((op) => shareDBToAceDelta(aceDoc, op))

    // apply the deltas
    aceDoc.applyDeltas(deltas)
}