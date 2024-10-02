<script>

import { stralign, strpins, extrapolate_alignment, process_original } from '$lib/strlib.js'

window.stralign = stralign
window.strpins = strpins


window.original = 
`“Oof!” the fox exclaimed as he hit the ground under a few hundred pounds of bear. Sekyr had managed to catch most of his own weight but there was still plenty left, especially around the midsection.
The two were panting again. Sekyr’s snout was right at Thorn’s neck, and he could smell the fox’s woodsy scent with every inhale. How had he not noticed how intoxicating it was before? Was that cedar? he asked himself. Did he rub himself with cedar? Does he do that every day?
The fox wheezed a little bit and the bear started. “Oh, sorry Thorn!” Sekyr quickly apologized as he stood up, grabbing the fox’s supple yet strong paw and helping him up too.
The fox looked down and grinned. “Uh, buddy, you sure you’re not distracted?”
The bear followed his gaze as he noticed the front of his gi was open. And to his horror, his full erection on display.
`;

let { origText, origLocs, dispSegs } = process_original(original)
window.origText = origText
window.origLocs = origLocs
window.dispSegs = dispSegs

window.segIndex = Array(origText.length).fill(null)
let wordi = 0
dispSegs.forEach( (seg, i) => {
    segIndex.splice(wordi, seg.word.length, ...Array(seg.word.length).fill(i))
    wordi += seg.word.length + 1
})


window.sr = new webkitSpeechRecognition()
sr.continuous = true
sr.interimResults = true
sr.maxAlternatives = 5
sr.onresult = on_sr_result

function start() {
    sr.start()
}

function stop() {
    sr.stop()
}

function on_sr_result(event) {
    let result = event.results[event.resultIndex]
    let isFinal = result.isFinal
    let bestscore = 0
    let besttranscript = null
    let bestalign = null

    dispSegs.forEach((seg) => {
        if (seg.foundInResultIndex === event.resultIndex) {
            seg.maybefound = false
        }
    })

    for (let i = 0; i < result.length; i++) {
        let transcript = result[i].transcript.toLowerCase().replace(/[^a-z ]/g, ' ')
        let confidence = result[i].confidence
        if (transcript.length < 16 && !isFinal) continue;
        let augmented = 0
        if (transcript.length < 16 && event.resultIndex > 0) {
            let aug = event.results[event.resultIndex-1][0].transcript.toLowerCase().replace(/[^a-z ]/g, ' ')
            transcript = aug + transcript
            augmented = aug.length
        }
        let aligns = stralign(transcript, origText, {})
        if (aligns === null) {
            console.log(`Couldn't find match for ${transcript}, skipping`)
            continue
        }
        aligns.forEach( (align) => {
            let nfound = align.reduce((a,b) => { return b != null ? a + 1 : a }, 0)
            if (nfound > bestscore) {
                bestalign = align
                besttranscript = transcript
            }
        })
        bestalign = bestalign.slice(augmented)
        console.log(`Found ${besttranscript} at ${bestalign}`)
        bestalign.forEach((origPos, transcriptPos) => {
            if (origPos === null) return;
            let segi = segIndex[origPos]
            if (segi === null) return;
            let seg = dispSegs[segi]
            if (!isFinal) {
                seg.maybefound = true
            }
            else {
                seg.found = true
            }
            highlight = segi+1
            seg.foundInResultIndex = event.resultIndex
            if (!seg.ts || seg.foundInResultIndex != event.resultIndex) {
                seg.ts = event.timeStamp
            }
        })
    }
    dispSegs = [...dispSegs]
}
let highlight=0

let vu = 0

navigator.mediaDevices.getUserMedia({ audio: true })
  .then(stream => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    const analyzer = audioContext.createAnalyser();
    analyzer.fftSize = 2048; 
    source.connect(analyzer)

    const dataArray = new Float32Array(analyzer.fftSize);

    // Function to calculate decibels (dB) from the audio waveform
    function calculateDecibels() {
        analyzer.getFloatTimeDomainData(dataArray);
        const rms = Math.sqrt(dataArray.reduce((a,b) => { return a + b*b }) / dataArray.length)
        const decibels = rms < 1e-60 ? -60 : (20 * Math.log10(rms));

        vu = (decibels - -60) / 60 * 100
        if (vu < 0 || isNaN(vu)) vu = 0;
        if (vu > 100) vu = 100;
        
        requestAnimationFrame(calculateDecibels);
    }

    // Start the VU meter
    calculateDecibels();

  })
  .catch(error => {
    console.error("Microphone access denied:", error);
  });


</script>
<style>
    .highlight {
        font-weight: bold;
    }
    .fade {
        opacity: 0.5;
    }
    .maybefound {
        color: #080;
    }
    .found {
        color: #8c8;
    }
    pre {
        font-family: Georgia, Times, 'Times New Roman', serif;
        font-size: 2em;
        white-space: pre-wrap;
    }
    .vu-meter {
        width: 200px;
        height: 20px;
        position: relative;
        overflow: hidden;
        border: 1px solid grey;
        float: right;
        margin: 10px;
    }
    .vu-level {
        height: 100%;
        transition: width 0.01s ease-in-out; /* Smooth width transition */
        overflow: hidden;
    }
    .vu-gradient {
        height: 100%;
        width: 200px;
        background: linear-gradient(to right, rgb(59, 167, 220), rgb(191, 191, 191), rgb(255, 0, 195));
    }
</style>
<div class="vu-meter">
    <div class="vu-level" style="width: {vu}%;">
        <div class="vu-gradient"></div>
    </div>
</div>
<p><button on:click={start}>Start</button> <button on:click={stop}>Stop</button></p>
<pre>{#each dispSegs as seg, index
    }<span class:fade={highlight>index} class:highlight={highlight==index} class:found={seg.found} class:maybefound={seg.maybefound} ts={seg.ts}>{@html seg.pre.replace("\n","<p />")
        }{seg.text}</span>{/each}</pre>
