data = {
    Cell: { url: "https://www.cell.com/cell/home" },
    "Cancer Cell": { url: "https://www.cell.com/cancer-cell/home" },
    "Cell Chemical Biology": { url: "https://www.cell.com/cell-chemical-biology" },
    "Cell Genomics": { url: "https://www.cell.com/cell-genomics/home" },
    "Cell Host & Microbe": { url: "https://www.cell.com/cell-host-microbe/home" },
    "Cell Metabolism": { url: "https://www.cell.com/cell-metabolism/home" },
    "Cell Reports": { url: "https://www.cell.com/cell-reports/home" },
    "Cell Reports Medicine": {
        url: "https://www.cell.com/cell-reports-medicine/home",
    },
    "Cell Stem Cell": { url: "https://www.cell.com/cell-stem-cell/home" },
    "Cell Systems": { url: "https://www.cell.com/cell-systems/home" },
    "Current Biology": { url: "https://www.cell.com/current-biology/home" },
    "Developmental Cell": { url: "https://www.cell.com/developmental-cell/home" },
    Immunity: { url: "https://www.cell.com/immunity/home" },
    Med: { url: "https://www.cell.com/med/home" },
    "Molecular Cell": { url: "https://www.cell.com/molecular-cell/home" },
    Neuron: { url: "https://www.cell.com/neuron/home" },
    Structure: { url: "https://www.cell.com/structure/home" },
    "American Journal of Human Genetics (partner)": {
        url: "https://www.cell.com/ajhg/home",
    },
    "Biophysical Journal (partner)": { url: "https://www.cell.com/biophysj/home" },
    "Biophysical Reports (partner)": {
        url: "https://www.cell.com/biophysreports/home",
    },
    "Human Genetics and Genomics Advances (partner)": {
        url: "https://www.cell.com/hgg-advances/home",
    },
    "Molecular Plant (partner)": { url: "https://www.cell.com/molecular-plant/home" },
    "Molecular Therapy (partner)": {
        url: "https://www.cell.com/molecular-therapy-family/molecular-therapy/home",
    },
    "Molecular Therapy Methods & Clinical Development (partner)": {
        url: "https://www.cell.com/molecular-therapy-family/methods/home",
    },
    "Molecular Therapy Nucleic Acids (partner)": {
        url: "https://www.cell.com/molecular-therapy-family/nucleic-acids/home",
    },
    "Molecular Therapy Oncology (partner)": {
        url: "https://www.cell.com/molecular-therapy-family/oncology/home",
    },
    "Plant Communications (partner)": {
        url: "https://www.cell.com/plant-communications/home",
    },
    "Stem Cell Reports (partner)": {
        url: "https://www.cell.com/stem-cell-reports/home",
    },
    "Trends in Biochemical Sciences": {
        url: "https://www.cell.com/trends/biochemical-sciences/home",
    },
    "Trends in Cancer": { url: "https://www.cell.com/trends/cancer/home" },
    "Trends in Cell Biology": {
        url: "https://www.cell.com/trends/cell-biology/home",
    },
    "Trends in Ecology & Evolution": {
        url: "https://www.cell.com/trends/ecology-evolution/home",
    },
    "Trends in Endocrinology & Metabolism": {
        url: "https://www.cell.com/trends/endocrinology-metabolism/home",
    },
    "Trends in Genetics": { url: "https://www.cell.com/trends/genetics/home" },
    "Trends in Immunology": { url: "https://www.cell.com/trends/immunology/home" },
    "Trends in Microbiology": {
        url: "https://www.cell.com/trends/microbiology/home",
    },
    "Trends in Molecular Medicine": {
        url: "https://www.cell.com/trends/molecular-medicine/home",
    },
    "Trends in Neurosciences": {
        url: "https://www.cell.com/trends/neurosciences/home",
    },
    "Trends in Parasitology": {
        url: "https://www.cell.com/trends/parasitology/home",
    },
    "Trends in Pharmacological Sciences": {
        url: "https://www.cell.com/trends/pharmacological-sciences/home",
    },
    "Trends in Plant Science": {
        url: "https://www.cell.com/trends/plant-science/home",
    },
    "Cell Biomaterials": { url: "https://www.cell.com/cell-biomaterials/home" },
    "Cell Reports Physical Science": {
        url: "https://www.cell.com/cell-reports-physical-science/home",
    },
    Chem: { url: "https://www.cell.com/chem/home" },
    "Chem Catalysis": { url: "https://www.cell.com/chem-catalysis/home" },
    Device: { url: "https://www.cell.com/device/home" },
    Joule: { url: "https://www.cell.com/joule/home" },
    Matter: { url: "https://www.cell.com/matter/home" },
    Newton: { url: "https://www.cell.com/newton/home" },
    "Trends in Chemistry": { url: "https://www.cell.com/trends/chemistry/home" },
    "Cell Reports Methods": { url: "https://www.cell.com/cell-reports-methods/home" },
    "Cell Reports Sustainability": {
        url: "https://www.cell.com/cell-reports-sustainability/home",
    },
    Heliyon: { url: "https://www.cell.com/heliyon/home" },
    iScience: { url: "https://www.cell.com/iscience/home" },
    "One Earth": { url: "https://www.cell.com/one-earth/home" },
    Patterns: { url: "https://www.cell.com/patterns/home" },
    "STAR Protocols": { url: "https://www.cell.com/star-protocols/home" },
    "Nexus (partner)": { url: "https://www.cell.com/nexus/home" },
    "The Innovation (partner)": { url: "https://www.cell.com/the-innovation/home" },
    "Trends in Biotechnology": {
        url: "https://www.cell.com/trends/biotechnology/home",
    },
    "Trends in Cognitive Sciences": {
        url: "https://www.cell.com/trends/cognitive-sciences/home",
    },
};
// parallel queries
const promises = Object.keys(data).map(
    (key) =>
        new Promise(async (resolve, reject) => {
            // get remote page text
            const text = await fetchText(data[key].url);
            // get issn from text (it is mentioned several times)
            let issn = text
                .match(/ISSN.+/gi)
                .reduce(
                    (acc, issn) => [
                        ...acc,
                        ...(issn.match(/\d{4}-\d{3}[0-9X]/g) || []),
                    ],
                    []
                );
            // remove duplicates
            issn = [...new Set(issn)];
            // add issn to data
            if (issn) {
                data[key].issn = issn;
            }
            resolve();
        })
);

// run all promises in parallel
await Promise.all(promises);

// print data for cell.json
console.log(JSON.stringify(data, null, 2));
