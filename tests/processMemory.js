exports.allIds = (memory) => {
    return Object.keys(memory);
};

exports.allValues = (memory, key, asObj = false) => {
    if (!asObj) {
        return Object.values(memory).map((item) => item[key]);
    }
    let values = {};
    Object.keys(memory).forEach((id) => {
        values[id] = memory[id][key];
    });
    return values;
};
