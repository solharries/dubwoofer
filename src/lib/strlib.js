export function process_original(original) {
    // Extract letters-only version of the original for matching
    let words = [...original.toLowerCase().matchAll(/[a-z]+/g)];
    let origText = words.map(m => m[0]).join(" ");

    // Create a back-mapping from the extracted letters to where they are in the original
    let origLocs = [];
    words.forEach(m => {
        for (let i = m.index; i < m.index + m[0].length; i++) {
            origLocs.push(i);
        }
        origLocs.push(undefined)
    });

    // Create the displayable items
    let dispSegs = [];
    let lastIdx = 0;
    words.forEach(m => {
        let start = m.index;
        let end = m.index + m[0].length;
        let word = m[0];
        let pre = ""
        if (start > lastIdx) {
            pre = original.slice(lastIdx, start)
        }
        let text = original.slice(start, end)
        lastIdx = end
        dispSegs.push({start, end, pre, text, word})
    })
    if (lastIdx < original.length) {
        dispSegs.push({start: lastIdx, end: original.length, pre: original.slice(lastIdx), text: "", word: ""})
    }

    return { origText, origLocs, dispSegs };
}

export function strpins(a, b, {maxlen = 10, minlen = 2, step = 1}) {
    if (minlen >= a.length) {
        minlen = a.length - 1;
    }

    let pins = [];
    for (let l = maxlen; l >= minlen; l--) {
        let subs = [];
        for (let x = 0; x <= a.length - l; x += step) {
            subs.push(a.slice(x, x + l));
        }

        subs.forEach((ss, i) => {
            // Escape special characters for regex
            let escapedSS = ss.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            let matches = Array.from(b.matchAll(new RegExp(escapedSS, 'g')));
            matches.forEach(match => {
                pins.push([i, match.index, ss.length]);
            });
        });
    }

    return pins;
}

export function stralign(a, b, { minlen = 5, maxlen = 16, minFind = 0.7, residualThreshold = 5, ransacIterations = 1000, display = false, yieldall = false, strstep = 1 }) {
    let pins = strpins(a, b, {minlen, maxlen, step:strstep});

    if (pins.length < 3) {
        if (display) {
            console.log("stralign fail, not enough matches found");
        }
        return null;
    }

    // Line checker ensures slope is approximately 1 (aligned strings)
    function linecheck(m, b) {
        return m > 0.5 && m < 1.5;
    }

    // Run RANSAC to get the best line
    const [npass, m, bIntercept, passmask] = linear_regress_ransac(
        pins.map(p => [p[0]]),
        pins.map(p => [p[1]]),
        residualThreshold,
        ransacIterations,
        linecheck
    );

    // Filter pins that passed the RANSAC check
    const inpins = pins.filter((_, i) => passmask[i]);

    let inter = Array(a.length).fill(null);
    inpins.forEach(([ia, ib, l]) => {
        for (let x = 0; x < l; x++) {
            if (inter[x + ia] === null) {
                inter[x + ia] = ib + x;
            }
        }
    });

    let nfound = inter.filter(x => x !== null).length;
    if (nfound / inter.length < minFind) {
        if (display) {
            console.log("stralign fail, not enough of string was found");
        }
        return null;
    }

    if (yieldall) {
        let bArray = b.split('');
        inter.forEach(x => {
            if (x !== null) {
                bArray[x] = '\x01'; // Replace matched characters with a control char
            }
        });
        let otherresult = stralign(a, bArray.join(''), minlen, maxlen, minFind, residualThreshold, ransacIterations, display, yieldall)
        if (otherresult) { 
            return [inter].concat(otherresult);
        }
        else {
            return [inter]
        }
    }

    return [inter];
}

export function linear_regress_ransac(x, y, maxError, iterations = 1000, lvalidator = null) {
    let best = [0, NaN, NaN, []];

    for (let it = 0; it < iterations; it++) {
        let p1 = Math.floor(Math.random() * x.length);
        let p2 = Math.floor(Math.random() * x.length);

        if (x[p2][0] === x[p1][0]) {
            continue;
        }

        let m = (y[p2][0] - y[p1][0]) / (x[p2][0] - x[p1][0]);
        let b = y[p1][0] - m * x[p1][0];

        if (lvalidator && !lvalidator(m, b)) {
            continue;
        }

        let yy = x.map(xi => m * xi[0] + b);
        let err = yy.map((yi, idx) => Math.abs(yi - y[idx][0]));
        let passmask = err.map(e => e < maxError);
        let npass = passmask.reduce((acc, curr) => acc + (curr ? 1 : 0), 0);

        if (!best || best[0] < npass) {
            best = [npass, m, b, passmask];
        }
    }

    return best;
}

export function extrapolate_alignment(al) {
    let lastValue = null;

    // Forward pass
    for (let i = 0; i < al.length; i++) {
        if (al[i] === null && lastValue !== null) {
            al[i] = lastValue + 1;
        }
        if (al[i] !== null) {
            lastValue = al[i];
        }
    }

    // Backward pass
    lastValue = null;
    for (let i = al.length - 1; i >= 0; i--) {
        if (al[i] === null && lastValue !== null) {
            al[i] = lastValue - 1;
        }
        if (al[i] !== null) {
            lastValue = al[i];
        }
    }

    return al;
}
