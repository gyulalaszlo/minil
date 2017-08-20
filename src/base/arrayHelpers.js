"use strict";


// puts `what` between the elements of `seq`
function interpose(what, seq) {
  let o    = [], len = seq.length;
  o.length = len * 2 - 1;
  for (let i = 0; i < len; ++i) {
    o[i * 2] = seq[i];
    if (i + 1 < len) { o[i * 2 + 1] = what; }
  }
  return o;
}

// returns the contents of seq grouped into n-tuples
function groupsOf(n, seq, includeIncomplete = true) {
  let o           = [], len = seq.length;
  let preferedLen = (includeIncomplete ? Math.floor : Math.ceil)(seq.length /
      n);

  o.length = preferedLen;

  for (let i = 0; i < preferedLen; ++i) {
    let g = [];
    o[i]  = g;

    for (let j = 0; j < n; ++j) {
      let seqIdx = i * n + j;
      // stop if over the end
      if (seqIdx >= len) {
        break;
      }
      g.push(seq[seqIdx]);
    }
  }

  return o;
}


module.exports = {interpose, groupsOf};