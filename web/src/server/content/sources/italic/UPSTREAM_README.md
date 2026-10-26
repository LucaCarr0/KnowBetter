# Dataset Card for ITALIC

<!-- Provide a quick summary of the dataset. -->

ITALIC is a benchmark evaluating language models' understanding of Italian culture, commonsense reasoning and linguistic proficiency in a morphologically rich language.

<p align="center">
  <img src="./img/examples.png" width="350"/>
</p>

Above are example questions from _ITALIC_. **Note**: every example is a direct translation; the original questions
are in Italian. The correct option is marked by (✓).

## Dataset Details

### Dataset Description

<!-- Provide a longer summary of what this dataset is. -->

We present _ITALIC_, a large-scale benchmark dataset of 10,000 multiple-choice questions designed to evaluate the natural language understanding of the Italian language and culture.
_ITALIC_ spans 12 domains, exploiting public tests to score domain experts in real-world scenarios.
We detail our data collection process, stratification techniques, and selection strategies.

_ITALIC_ provides a comprehensive assessment suite that captures commonsense reasoning and linguistic proficiency in a morphologically rich language.
It serves as a benchmark for evaluating existing models and as a roadmap for future research, encouraging the development of more sophisticated and culturally aware natural language systems.

- **Curated by:** CRISP research centre https://crispresearch.it/
- **Language(s) (NLP):** Italian
- **License:** MIT

### How to Use

First, clone the ITALIC repository to your local machine:

```bash
git clone https://github.com/Crisp-Unimib/ITALIC.git
cd ITALIC
```

To avoid conflicts with system packages, it's recommended to use a virtual environment:

```bash
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate
```

ITALIC requires vLLM for serving models. Install it with:

```bash
pip install vllm[all]
```

Run the vLLM server with your preferred model. Here’s an example using meta-llama/Llama-3.3-70B-Instruct:

```bash
vllm serve meta-llama/Llama-3.3-70B-Instruct
```

Once the vLLM server is running, you can tweak setting in config.yaml, such as model name, API endpoint, temperature, max tokens.
You can then execute the evaluation script:

```bash
python run_eval.py
```

The evaluation runs at few-shot by default. If you want to evaluate your models in a zero-shot setting, please set the _few_shot_file_ line as _None_ in the config.yaml file.

### Dataset Sources

<!-- Provide the basic links for the dataset. -->

- **Huggingface:** https://huggingface.co/datasets/Crisp-Unimib/ITALIC
- **Leaderboard:** https://huggingface.co/spaces/Crisp-Unimib/ITALIC-Leaderboard
- **Zenodo:** https://doi.org/10.5281/zenodo.14725822
- **Paper:** [Full Paper Available at ACL Anthology](https://aclanthology.org/2025.naacl-long.68.pdf)

## Dataset Structure

<!-- This section provides a description of the dataset fields, and additional information about the dataset structure such as criteria used to create the splits, relationships between data points, etc. -->

_ITALIC_ contains 10,000 carefully curated questions selected from an initial corpus of 2,110,643 questions.

Each question is formatted as a multiple-choice query, with an average question length of 87 characters and a median of 4 answer options.
The longest question is 577 characters long. The minimum number of choices per question is 2, while the maximum is 5.
The total number of tokens across the input data amounts to 499,963.

| Column           | Data Type | Description                                     |
| ---------------- | --------- | ----------------------------------------------- |
| `question`       | [String]  | The actual content of the question              |
| `options`        | [List]    | The options to choose from. Only one is correct |
| `answer`         | [String]  | The correct answer out of the options           |
| `category`       | [String]  | The dedicated cultural section of the question  |
| `macro_category` | [String]  | The macro category of the question              |

## Dataset Creation

### Curation Rationale

<!-- Motivation for the creation of this dataset. -->

The corpus comprises questions and tasks from real-world exams, professional assessments, and domain-specific challenges.
Given that the data originates from institutional sources, it is expected to maintain a high standard of quality and accuracy, as domain experts crafted it for public evaluations.

### Source Data

<!-- This section describes the source data (e.g. news text and headlines, social media posts, translated sentences, ...). -->

#### Data Collection and Processing

<!-- This section describes the data collection and processing process such as data selection criteria, filtering and normalization methods, tools and libraries used, etc. -->

The initial data was sourced from various files in PDF, HTML, DOC, and other formats published by official bodies that announce individual competitive public examinations.

Please consult the full paper for a detailed description of our curation process.

<center><img src="./img/workflow.svg" width="350" height="350" /></center>

#### Who are the source data producers?

<!-- This section describes the people or systems who originally created the data. It should also include self-reported demographic or identity information for the source data creators if this information is available. -->

The dataset includes tests for admission to the Carabinieri, Penitentiary Police, Italian Army, State Police, Forestry Corps, Firefighters, Air Force, Navy, Guardia di Finanza, Italian ministries, teachers of the Italian school system of all levels, principals of the Italian school system of all levels, nurses of the national health system, and managers of the public administration from 2008 to 2024 available freely on the website of each institutional body.

#### Personal and Sensitive Information

<!-- State whether the dataset contains data that might be considered personal, sensitive, or private (e.g., data that reveals addresses, uniquely identifiable names or aliases, racial or ethnic origins, sexual orientations, religious beliefs, political opinions, financial or health data, etc.). If efforts were made to anonymize the data, describe the anonymization process. -->

The dataset does not contain confidential information.
It is also free from content that could be considered offensive, insulting, threatening, or distressing. Since it solely comprises data from standardised tests and does not involve human subjects or personal data, an ethical review process was not required.

## Bias, Risks, and Limitations

<!-- This section is meant to convey both technical and sociotechnical limitations. -->

Potential risks of misuse include using the benchmark results to justify or argue against the need to develop native LLMs specifically tailored for the Italian language.
This possibility should be considered to avoid misinterpretations or unintended consequences when leveraging the evaluation outcomes.

### Maintenance

_ITALIC_ is designed to be robust and fully operational upon release, with no need for routine maintenance. However, as language and cultural norms evolve, periodic updates will be required to ensure the benchmark remains relevant. A new dataset version will be created and made available in such cases.

## Citation

<!-- If there is a paper or blog post introducing the dataset, the APA and Bibtex information for that should go in this section. -->

**BibTeX:**

```
@inproceedings{seveso2025italic,
  title={ITALIC: An Italian Culture-Aware Natural Language Benchmark},
  author={Seveso, Andrea and Potert{\`\i}, Daniele and Federici, Edoardo and Mezzanzanica, Mario and Mercorio, Fabio},
  booktitle={Proceedings of the 2025 Conference of the Nations of the Americas Chapter of the Association for Computational Linguistics: Human Language Technologies (Volume 1: Long Papers)},
  pages={1469--1478},
  year={2025}
}
```

**APA:**

```
Seveso, A., Potertì, D., Federici, E., Mezzanzanica, M., & Mercorio, F. (2025, April). ITALIC: An Italian Culture-Aware Natural Language Benchmark. In Proceedings of the 2025 Conference of the Nations of the Americas Chapter of the Association for Computational Linguistics: Human Language Technologies (Volume 1: Long Papers) (pp. 1469-1478).
```

## Dataset Card Contact

Andrea Seveso - andrea.seveso@unimib.it
