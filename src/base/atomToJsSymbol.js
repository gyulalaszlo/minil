"use strict";

const CHAR_NAME_MAP = [

  [/\+/g, " Plus "],
  [/^-$/g, " Minus "],
  //[/-/g, '_'],
  [/=/g, " Equal "],
  [/[^a-zA-Z0-9_\$\.]+/g, " "]
];

function camelizeWord(str) {
  return str.substr(0, 1).toUpperCase() + str.substr(1);
}

function camelize(str) {
  let renamed = CHAR_NAME_MAP.reduce(function(built, [rx, renameTo]) {
    return built.replace(rx, renameTo);
  }, str);

  let words      = renamed.split(/ +/g);
  let fromSecond = words.slice(1).map(camelizeWord);
  return words.slice(0, 1).concat(fromSecond).join("");
}

module.exports = camelize;