#!/bin/sh

PYTHONPATH=.
pdm run python src/preprocessing/cleaner.py --path $1
