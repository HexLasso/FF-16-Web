const kFileSelector = document.getElementById("fileSelector");
const kPanel        = document.getElementById("panel");
const kHexDump      = document.getElementById("hexDumpPanel");
const kPatternsDump = document.getElementById("patternsPanel");

// Block size is 256 bytes
const kBlockSize = 256;

// Default values
const kDefMinGap    = 0
const kDefMaxGap    = 31
const kDefThreshold = 5
const kTopN         = 10

// Operation ranges
const kMinGapLo    = 0
const kMinGapHi    = 127
const kMaxGapLo    = 0
const kMaxGapHi    = 127
const kThresholdLo = 1
const kThresholdHi = 255
const kFileSizeLo  = 256
const kFileSizeHi  = 4 * 1024 * 1024 // 4 MB

// Hexdump
const kCharLen = 1
const kLineLen = 16
const kPageLen = 256

// Worst case array size for varying gaps
// +1 for gap=0
const GapTable = new Array(kMaxGapHi + 1);

const patternInfo = {
  first:     0, // First byte of the pattern
  second:    0, // Second byte of the pattern
  gap:       0, // Number of bytes between First and Second
  hits:      0, // Count of matches
  positions: [] // Positions of matches
};

// Input file
var gFileBuffer;
var gFileSize;

// State
var gOffset = 0;
var gHighlightId = 0;

function handleFileSelection(files) {
    var file = files[0];

    if (file == null) { // canceled
        location.reload();
        return;
    }
    
    if (file.size < kFileSizeLo || file.size > kFileSizeHi)
    {
        alert("FF-16 Web can open files between 256 bytes and 4 MB in size.");
        location.reload();
        return;
    }

    var reader = new FileReader();

    reader.onloadend = function (evt) {
        if (evt.target.readyState == FileReader.DONE) { // DONE == 2
            gFileBuffer = new Uint8Array(evt.target.result);
            gFileSize = file.size;
            loadMain();
        }
    };

    var blob = file.slice(0, file.size);
    reader.readAsArrayBuffer(blob);
}

// Keyboard events
document.addEventListener("keydown", (e) => {
    switch (e.key) {
        case "ArrowDown":
            gOffset = Math.min(gOffset + kLineLen, gFileSize - kBlockSize);
            break;
        case "ArrowUp":
            gOffset = Math.max(gOffset - kLineLen, 0);
            break;
        case "ArrowRight":
            gOffset = Math.min(gOffset + kCharLen, gFileSize - kBlockSize);
            break;
        case "ArrowLeft":
            gOffset = Math.max(gOffset - kCharLen, 0);
            break;
        case "PageDown":
            gOffset = Math.min(gOffset + kPageLen, gFileSize - kBlockSize);
            break;
        case "PageUp":
            gOffset = Math.max(gOffset - kPageLen, 0);
            break;
        case "Home":
            gOffset = 0;
            break;
        case "End":
            gOffset = gFileSize - kBlockSize;
            break;
        case "0":
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6":
        case "7":
        case "8":
        case "9":
            gHighlightId = e.key - '0';
            break;
    }

    Update();
});

function toPrintable(first, second) {
    let firstPrintable = '.';
    let secondPrintable = '.';

    if (first >= 0x20 && first <= 0x7E) {
        firstPrintable = "&#" + first + ";";
    }

    if (second >= 0x20 && second <= 0x7E) {
        secondPrintable = "&#" + second + ";";
    }

    return firstPrintable + secondPrintable;
}

function printHexDump(buffer, size, mapData, fileOffset) {
    let width = kLineLen;
    let result = "";

    let hexOffset = "";
    let hexByteString = "";
    let asciiString = "";

    for (let i = 0; i < size; i++)
    {
        if (i % width == 0)
        {
            hexOffset = ('00000000' + (fileOffset+i).toString(16)).slice(-8);
        }

        let hexByte = "";

        if (i >= size)
        {
            hexByte = "   ";
            asciiString = asciiString.concat(" ");
        }
        else
        {
            if (mapData[i] == 1)
            {
                hexByte = hexByte.concat("<mark>")
                asciiString = asciiString.concat("<mark>")
            }

            hexByte = hexByte.concat((('00' + buffer[i].toString(16)).slice(-2)) + ' ');

            if (buffer[i] >= 0x20 && buffer[i] <= 0x7E)
            {
                asciiString = asciiString.concat("&#" + parseInt(buffer[i].toString() + ";"));
            }
            else
            {
                asciiString = asciiString.concat(".");
            }

            if (mapData[i] == 1)
            {
                hexByte = hexByte.concat("</mark>")
                asciiString = asciiString.concat("</mark>")
            }
        }

        hexByteString = hexByteString.concat(hexByte);

        if (i % width == (width - 1))
        {
            result = result.concat(hexOffset + " ");
            result = result.concat(hexByteString + " ");
            result = result.concat(asciiString + "</br>");

            hexByteString = "";
            asciiString = "";
        }
    }

    kHexDump.innerHTML = result;
}

function createMap(positionList) {
    let map = new Uint8Array(256);

    for (var i = 0; i < positionList.length; i++)
    {
        map[positionList[i]] = 1;
    }

    return map;
}

function Update() {
    let blockBuf = gFileBuffer.slice(gOffset, gOffset + kBlockSize);

    blockFreqTable = new Map();

    for (let gapIdx = kDefMinGap; gapIdx <= kDefMaxGap; gapIdx++) {
        for (let bufIdx = 0; bufIdx < kBlockSize - 1 - GapTable[gapIdx]; bufIdx++) {
            const key = `${blockBuf[bufIdx].toString(16).padStart(2, '0')} +(${GapTable[gapIdx]}) ${blockBuf[bufIdx + GapTable[gapIdx] + 1].toString(16).padStart(2, '0')}`;
            const hits = (blockFreqTable.get(key)?.Hits ?? 0) + 1;
            positions = blockFreqTable.get(key)?.Positions || [];
            positions.push(bufIdx);
            positions.push(bufIdx + GapTable[gapIdx] + 1);
            blockFreqTable.set(key, {
                First:     blockBuf[bufIdx],
                Second:    blockBuf[bufIdx + GapTable[gapIdx] + 1],
                Gap:       GapTable[gapIdx],
                Hits:      hits,
                Positions: positions
            });
        }
    }

    // Get the top 10 patterns of the block
    const topHits = new Array(kTopN).fill(0);
    const topKeys = new Array(kTopN).fill("");
    for (const [k, v] of blockFreqTable) {
        const hits = v.Hits;

        for (let i = 0; i < kTopN; i++) {
            // Higher hits first
            // If there are multiple patterns with the same hits, choose deterministically
            if (hits > topHits[i] || (hits === topHits[i] && (topKeys[i] === "" || k < topKeys[i]))) {
                for (let j = kTopN - 1; j > i; j--) {
                    topHits[j] = topHits[j - 1];
                    topKeys[j] = topKeys[j - 1];
                }

                topHits[i] = hits;
                topKeys[i] = k;
                break;
            }
        }
    }

    let map = createMap(blockFreqTable.get(topKeys[gHighlightId]).Positions);
    printHexDump(blockBuf, kBlockSize, map, gOffset);

    kPatternsDump.innerHTML = "# Pattern        Ascii Freq<br/>";
    for (let i = 0; i < kTopN; i++) {
        let printable = '|' + toPrintable(blockFreqTable.get(topKeys[i])?.First, blockFreqTable.get(topKeys[i])?.Second) + '|';

        let patternLine = i + " " + topKeys[i].padEnd(15) + " " + printable.padStart(4) + " " + topHits[i].toString().padStart(4)
        if (gHighlightId == i) {
            kPatternsDump.innerHTML += "<mark>"  + patternLine + "</mark><br/>";
        } else {
            kPatternsDump.innerHTML += patternLine + "<br/>";
        }
    }
}

function loadMain() {
    // Clear
    kHexDump.innerHTML = '';
    kPatternsDump.innerHTML = '';
    kFileSelector.style.display = "none";

    // Show
    kPanel.style.display = "block";

    // Init
    for (let i = kMinGapLo; i <= kMaxGapHi; i++) {
        GapTable[i] = i;
    }

    Update();
}
