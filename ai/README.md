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

To prepare dataset that in particular consist of abstracts downloaded from [arxiv.org](https://arxiv.org/) one should run the script with a code from below:

```bash
pdm run python abstract_scraper/abstract_scraper.py
```

The code should be run from `ai` directory.  
Logs can be found here: `ai/abstract_scraper/abstract_scraper_XXXXXXXXX.log`
