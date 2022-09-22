# FSDL Keyword PaperMemory

## Requirements

1. Python 3.10 or above
2. PDM (as a dependency manager) -> download and install from [here](https://pdm.fming.dev/latest/#installation)

## Setup environment

Below code will create a virtual environment as well as download and install required packages.  

```bash
cd ai
pdm sync
```

## Abstract scraper

To prepare dataset that in particular consists of abstracts downloaded from [arxiv.org](https://arxiv.org/) one should run the script with a code from below:

```bash
make get-fresh-data
```

Output will be a JSON file that will be saved to `ai/data` directory, log will be stored in `ai/logs`.

## Abstract cleaner

The abstract cleaner was created based on simple EDA that is shown in `notebooks/simple_eda.ipynb`. To preprocess and clean abstracts downloaded from [arxiv.org](https://arxiv.org/) one should run the scrip with a code from below:

```bash
make clean-abstracts path=<PATH-TO-SCRAPED-ARXIV-DATASET>
```

Output will be a plain text file (abstract per row) that will be saved to `ai/data` directory with `_cleaned.txt` suffix, log will be stored in `ai/logs`.
