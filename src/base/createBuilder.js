"use strict";

const t = require("tcomb");

function createBuilder(argTypes, forType, constructor) {

  const lastArgIdx        = argTypes.length - 1;
  const GetBuilderFn      = t.func(argTypes, forType, t.getTypeName(forType) +
      "/BuilderFn");
  const emptyGetBuilderFn = GetBuilderFn.of(constructor, true);
  const GetBuilder        = t.struct({
                                       next: t.Func, count: t.Integer
                                     }, {
                                       name        : t.getTypeName(forType) +
                                       "/Builder",
                                       defaultProps: {
                                         next : emptyGetBuilderFn,
                                         count: 0
                                       }
                                     });

  GetBuilder.prototype.append = function(what) {
    let next = this.next(what);
    if (this.count === lastArgIdx) {
      return next;
    }
    return GetBuilder.update(this, {
      count: {$set: this.count + 1},
      next : {$set: next}
    });
  };

  return {
    union: t.union([forType, GetBuilder]),
    //empty: GetTuple({})
    empty: GetBuilder({})
  };
}

module.exports = createBuilder;