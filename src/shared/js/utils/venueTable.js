// The conference / venue table. A leaf module (no imports): venues.js and the PMLR source
// (sources/pmlr.js, loaded by config.js) both read it, without an import cycle.

/**
 * The single conference / venue table.
 * - `abbr`: canonical short name
 * - `names`: long names (first one is the display name); sponsor words (IEEE, ACM, CVF,
 *   "Annual", "The", "Proceedings of") are ignored when matching so they need not be listed
 * - `aliases`: other short forms
 * - `pmlr`: used by the PMLR source (booktitle substring -> abbr, via names[0])
 * @type {{abbr: string, names: string[], aliases?: string[], pmlr?: boolean}[]}
 */
export const CONFERENCES = [
    {
        abbr: "CoLT",
        names: ["Conference on Learning Theory"],
        aliases: ["COLT"],
        pmlr: true,
    },
    {
        abbr: "ICML",
        names: ["International Conference on Machine Learning"],
        pmlr: true,
    },
    {
        abbr: "UAI",
        names: ["Conference on Uncertainty in Artificial Intelligence"],
        pmlr: true,
    },
    { abbr: "CoRL", names: ["Conference on Robot Learning"], pmlr: true },
    {
        abbr: "AISTATS",
        names: ["International Conference on Artificial Intelligence and Statistics"],
        pmlr: true,
    },
    {
        abbr: "ALT",
        names: ["International Conference on Algorithmic Learning Theory"],
        pmlr: true,
    },
    {
        abbr: "NeurIPS",
        names: [
            "Conference on Neural Information Processing Systems",
            "Neural Information Processing Systems",
            "Advances in Neural Information Processing Systems",
            "Conference and Workshop on Neural Information Processing Systems",
        ],
        aliases: ["NIPS"],
    },
    { abbr: "ICLR", names: ["International Conference on Learning Representations"] },
    {
        abbr: "CVPR",
        names: [
            "Conference on Computer Vision and Pattern Recognition",
            "Computer Vision and Pattern Recognition",
        ],
    },
    { abbr: "ICCV", names: ["International Conference on Computer Vision"] },
    { abbr: "ECCV", names: ["European Conference on Computer Vision"] },
    {
        abbr: "WACV",
        names: [
            "Winter Conference on Applications of Computer Vision",
            "Workshop on Applications of Computer Vision",
        ],
    },
    { abbr: "BMVC", names: ["British Machine Vision Conference"] },
    {
        abbr: "ACL",
        names: [
            "Annual Meeting of the Association for Computational Linguistics",
            "Association for Computational Linguistics",
        ],
    },
    {
        abbr: "EMNLP",
        names: [
            "Conference on Empirical Methods in Natural Language Processing",
            "Empirical Methods in Natural Language Processing",
        ],
    },
    {
        abbr: "NAACL",
        names: [
            "Conference of the North American Chapter of the Association for Computational Linguistics",
            "North American Chapter of the Association for Computational Linguistics",
        ],
    },
    {
        abbr: "EACL",
        names: [
            "Conference of the European Chapter of the Association for Computational Linguistics",
            "European Chapter of the Association for Computational Linguistics",
        ],
    },
    {
        abbr: "COLING",
        names: ["International Conference on Computational Linguistics"],
    },
    { abbr: "AAAI", names: ["AAAI Conference on Artificial Intelligence"] },
    {
        abbr: "IJCAI",
        names: ["International Joint Conference on Artificial Intelligence"],
    },
    {
        abbr: "KDD",
        names: [
            "ACM SIGKDD Conference on Knowledge Discovery and Data Mining",
            "International Conference on Knowledge Discovery and Data Mining",
            "Knowledge Discovery and Data Mining",
        ],
        aliases: ["SIGKDD"],
    },
    {
        abbr: "WWW",
        names: [
            "The Web Conference",
            "International World Wide Web Conference",
            "International Conference on World Wide Web",
        ],
        aliases: ["TheWebConf"],
    },
    {
        abbr: "SIGIR",
        names: [
            "International ACM SIGIR Conference on Research and Development in Information Retrieval",
        ],
    },
    { abbr: "WSDM", names: ["International Conference on Web Search and Data Mining"] },
    { abbr: "ICRA", names: ["International Conference on Robotics and Automation"] },
    {
        abbr: "IROS",
        names: ["International Conference on Intelligent Robots and Systems"],
    },
    { abbr: "RSS", names: ["Robotics: Science and Systems"] },
    {
        abbr: "MICCAI",
        names: [
            "International Conference on Medical Image Computing and Computer-Assisted Intervention",
        ],
    },
    {
        abbr: "Interspeech",
        names: ["Conference of the International Speech Communication Association"],
    },
    {
        abbr: "ICASSP",
        names: ["International Conference on Acoustics, Speech and Signal Processing"],
    },
    {
        abbr: "CHI",
        names: [
            "Conference on Human Factors in Computing Systems",
            "CHI Conference on Human Factors in Computing Systems",
        ],
    },
    {
        abbr: "TMLR",
        names: [
            "Transactions on Machine Learning Research",
            "Trans. Mach. Learn. Res.",
        ],
    },
    {
        abbr: "JMLR",
        names: ["Journal of Machine Learning Research", "J. Mach. Learn. Res."],
    },
    {
        abbr: "TPAMI",
        names: ["Transactions on Pattern Analysis and Machine Intelligence"],
        aliases: ["PAMI", "T-PAMI"],
    },
];

/** Map of long booktitle substring -> abbr for the PMLR source (same output as before). */
export const pmlrConfOverrides = () =>
    Object.fromEntries(
        CONFERENCES.filter((c) => c.pmlr).map((c) => [c.names[0], c.abbr]),
    );
