const ReconnectingWebSocket = require('reconnecting-websocket')
const sharedb = require('sharedb/lib/client')
const richText = require('rich-text')
const tinycolor = require('tinycolor2')
const ObjectID = require('bson-objectid')


sharedb.types.register(richText.type)

let colors = {}

const collection = 'code-editor'
const id = ROOM_ID
const userId = new ObjectID().toString()

const socket = new ReconnectingWebSocket('ws://' + window.location.host)
const connection = new sharedb.Connection(socket)

const doc = connection.get(collection, id);

doc.subscribe(function (err) {
    if (err) throw err;
    initialiseAce(doc);
})

function initialiseAce(doc) {
    const editor = ace.edit("editor")
    editor.setTheme("ace/theme/monokai")
    editor.session.setMode("ace/mode/javascript")
    editor.setOption("enableMultiselect", false)

    const Session = editor.getSession()
    const aceDoc = Session.getDocument()

    // multi cursor setup
    const curMgr = new AceCollabExt.AceMultiCursorManager(editor.getSession())
    const selMgr = new AceCollabExt.AceMultiSelectionManager(editor.getSession())
    const Selection = Session.getSelection()
    const Range = ace.require("ace/range").Range

    let localChange = false;

    // to prevent changes made programatically to trigger on change event
    localChange = true
    applyOps(aceDoc, doc.data.ops)
    localChange = false

    Session.on("change", delta => {
        if (localChange) {
            // local changes so skip
            return
        }
        const op = aceToQuillDelta(aceDoc, delta)

        doc.submitOp(op)
    })

    doc.on('op', (ops, source) => {
        if (source) {
            return
        }
        // to prevent changes made programatically to trigger on change event
        // change is a synchronus event in ace so this works
        localChange = true
        applyOps(aceDoc, ops.ops)
        localChange = false
    })

    Selection.on("changeCursor", () => {
        setTimeout(() => {
            const range = Selection.getRange()
            const selection = getSelectionIndex(range)

        }, 0)
    })

    function getSelectionIndex(range) {
        const cursor = Selection.getCursor()
        const cursorPos = aceDoc.positionToIndex(cursor)
        const startPos = aceDoc.positionToIndex(range.start)
        const endPos = aceDoc.positionToIndex(range.end)

        // start is where the selection began and end is where the selection ended, end is also the cursor position
        let start, end;
        if (cursorPos === startPos) {
            end = cursorPos
            start = endPos
        }
        else {
            end = endPos
            start = startPos
        }

        return [start, end]
    }
}


function aceToQuillDelta(aceDoc, delta) {
    let ops = []
    // if operation is performed on 0th index skip retain
    if (delta.start.row !== 0 || delta.start.column !== 0) {
        let retainOp = {}
        const pos = aceDoc.positionToIndex(delta.start)
        retainOp.retain = pos
        ops.push(retainOp)
    }
    if (delta.action === 'insert') {
        let insertOp = {}
        const str = delta.lines.join('\n')
        insertOp.insert = str
        ops.push(insertOp)
    }
    else if (delta.action === 'remove') {
        let deleteOp = {}
        const len = delta.lines.join('\n').length
        deleteOp.delete = len
        ops.push(deleteOp)
    }

    return { ops }
}

function QuillToAceDelta(aceDoc, ops) {
    let deltas = [];
    let pointer = 0;

    ops.forEach(operation => {
        let delta = {}

        delta.start = aceDoc.indexToPosition(pointer) || { row: 0, column: 0 }
        if (operation.retain)
            pointer += operation.retain
        else if (operation.insert) {
            delta.action = 'insert'
            delta.lines = operation.insert.split('\n')
            if (delta.lines.length === 1) {
                delta.end = {
                    row: delta.start.row,
                    column: delta.start.column + operation.insert.length,
                }
            } else {
                delta.end = {
                    row: delta.start.row + (delta.lines.length - 1),
                    column: delta.lines[delta.lines.length - 1].length,
                }
            }
            pointer += operation.insert.length
            deltas.push(delta)
        }
        else {
            delta.action = 'remove'
            // initialize accumulater with lines.length - 1 to take '\n' into account
            const count = operation.delete
            delta.end = aceDoc.indexToPosition(pointer + count)
            deltas.push(delta)
        }
    })

    return deltas
}


function applyOps(aceDoc, ops) {
    // converts the ops provided by shareDB doc 'op' event to Ace delta and applies them
    const deltas = QuillToAceDelta(aceDoc, ops)
    // apply the deltas
    aceDoc.applyDeltas(deltas)
}



// function getSelectionRanges({ start, end }) {
//     const selectedRanges = []

//     if (start.row === end.row && start.column === end.column) {
//         return [start]
//     }

//     const nLines = end.row - start.row + 1

//     let lastColumn = editor.session.getDocumentLastRowColumn(start.row, 0)
//     selectedRanges.push(new Range(start.row, start.column, start.row, lastColumn))

//     if (nLines === 1)
//         return selectedRanges

//     for (let i = 1; i < nLines; i++) {
//         lastColumn = editor.session.getDocumentLastRowColumn(start.row + i, 0)
//         selectedRanges.push(new Range(start.row + i, 0, start.row + i, lastColumn))
//     }
//     lastColumn = editor.session.getDocumentLastRowColumn(end.row, 0)
//     selectedRanges.push(new Range(end.row, 0, end.row, lastColumn))


//     return selectedRanges
// }