import argparse
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import List

import pandas as pd

NOW = datetime.now()
logging.basicConfig(
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    level=logging.INFO,
    handlers=[
        logging.FileHandler(f"logs/cleaner_{NOW}.log"),
        logging.StreamHandler(),
    ],
)


class AbstractCleaner:
    def __init__(self, filepath: str) -> None:
        self.filepath = Path(filepath)

    def clean(self) -> None:
        logging.info("Starting to clean abstracts")
        save_to = self.filepath.parent / (self.filepath.stem + "_cleaned.txt")

        logging.info("Loading dataset")
        df = self._load_dataset()
        logging.info("Dropping duplicates")
        df = self._drop_duplicates(df)
        logging.info("Removing abstracts for withdrawn papers")
        df = self._remove_abstracts_for_withdrawn_papers(df)
        logging.info("Cleaning strings")
        abstracts_clean = df.abstract.apply(self._perform_cleaning).tolist()
        logging.info(f"Saving cleaned dataset to {save_to}")
        self._save_dataset(abstracts_clean, save_to)

    def _load_dataset(self) -> pd.DataFrame:
        return pd.read_json(self.filepath)

    def _save_dataset(self, clean_abstracts: List[str], save_to: Path) -> None:
        with open(save_to, "w") as fp:
            for clean_abstract in clean_abstracts:
                fp.write(f"{clean_abstract}\n")

    def _perform_cleaning(self, text: str) -> str:
        text = self._replace_newline_character_with_whitespace(text)
        text = self._remove_redundant_escapes(text)
        text = self._remove_latex_suffixes_prefixes(text)
        text = self._remove_multiple_whitespaces(text)
        text = self._remove_urls(text)

        return text

    @staticmethod
    def _drop_duplicates(df: pd.DataFrame) -> pd.DataFrame:
        return df.drop_duplicates(subset=["abstract"], keep="first")

    @staticmethod
    def _remove_abstracts_for_withdrawn_papers(df: pd.DataFrame) -> pd.DataFrame:
        pattern = r"(paper has been withdrawn)|(withdrawn due to)"
        return df[~df.abstract.str.contains(pattern, case=False, regex=True)]

    @staticmethod
    def _remove_redundant_escapes(text: str) -> str:
        return re.sub(r"\\+", r"\\", text)

    @staticmethod
    def _remove_latex_suffixes_prefixes(text: str) -> str:
        text = re.sub(
            r"\$+([a-z])\$+", r"\1", text, flags=re.IGNORECASE | re.DOTALL
        )  # clean single letters
        text = re.sub(
            r"\$+\\(\w+)\s*\$+", r"\1", text, flags=re.IGNORECASE | re.DOTALL
        )  # clean symbols
        return re.sub(
            r"\$+.*?\$+", "equation", text, flags=re.IGNORECASE | re.DOTALL
        )  # clean equations

    @staticmethod
    def _replace_newline_character_with_whitespace(text: str) -> str:
        return re.sub(r"\\n", " ", text)

    @staticmethod
    def _remove_multiple_whitespaces(text: str) -> str:
        return re.sub(r"\s+", " ", text)

    @staticmethod
    def _remove_urls(text: str) -> str:
        return re.sub(
            r"((https?)\:\/\/)?[a-zA-Z0-9\.\/\?\:@\-_=#]+\.([a-zA-Z]){2,6}([a-zA-Z0-9\.\&\/\?\:@\-_=#])*",
            "",
            text,
            flags=re.IGNORECASE | re.DOTALL,
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--path", type=str, required=True)
    args = parser.parse_args()

    return args


def main() -> None:
    args = parse_args()
    abstract_cleaner = AbstractCleaner(args.path)
    abstract_cleaner.clean()


if __name__ == "__main__":
    main()
