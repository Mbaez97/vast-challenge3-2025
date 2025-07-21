# Vast-challenge3-2025
Project for making the mini challenge 3 of VAST
The mini challenge 3 consists of helping Clepper Jessen, a former analyst, to find corruption acts in the "Oceanus" Island.

## What do we have?
We have a knowledge graph describing the last two weeks on the island, this graph represents all intercepted radio communications.

## Task and questions:
1. Clepper found that messages frequently came in at around the same time each day.
    - Develop a graph-based visual analytics approach to identify any daily temporal patterns in communications.
    - How do these patterns shift over the two weeks of observations?
    - Focus on a specific entity and use this information to determine who has influence over them.

2. Clepper has noticed that people often communicate with (or about) the same people or vessels, and that grouping them together may help with the investigation.
    - Use visual analytics to help Clepper understand and explore the interactions and relationships between vessels and people in the knowledge graph.
    - Are there groups that are more closely associated? If so, what are the topic areas that are predominant for each group?

3. Some people and vessels are using pseudonyms to communicate.
    - Expanding upon your prior visual analytics, determine who is using pseudonyms to communicate, and what these pseudonyms are.
    - Describe how your visualization makes it easier for Clepper to identify common entities in the knowledge graph.
    - How does your understanding of activities change given your understanding of pseudonyms?

4. Clepper suspects that Nadia Contti, who was formerly entangled in an illegal fishing scheme, may have continued illicit activity within Oceanus.
    - Through visual analytics, provide evidence that Nadia is, or is not, doing something illegal.
    - Summarize Nadia's actions visually. Are Clepper's suspicions justified?

## Submission

The submission consists of:
- `index.htm`: Contains the written answers to all four challenge questions along with images of the visualizaions and analysis.
- Video demonstration: [https://youtu.be/ibX6Hd1Dvuc](https://youtu.be/ibX6Hd1Dvuc) showing the interactive visualization tools and their usage.

## Project structure:
- `app/`: Flask application containing the main visualization system.
  - `static/`: Static files (CSS and JavaScript) for visualizations.
    - `css/`: Stylesheets for different visualization components.
    - `js/`: JavaScript files for interactive visualizations.
  - `templates/`: HTML templates for the Flask web interface.
  - `visualizations/`: Python modules for data processing and visualization logic.
- `data/`: Contains the knowledge graph data in JSON and CSV formats.
- `notebooks/`: Jupyter notebooks for data analysis and exploration.
- `images/`: Project images and diagrams.
- `index.htm`: Main submission file.
- `README.md`: This file, providing an overview of the project.
- `pyproject.toml`: Python dependencies and project configuration.
- `uv.lock`: Lock file for UV package manager.

## Running flask app

```
flask run --debug
```

## UV quick guide:

* Install UV:

```
curl -LsSf https://astral.sh/uv/install.sh | sh
```

or

```
pip install uv
```

* Install dependencies and create venv:

```
uv sync
```

* Add dependency

```
uv add numpy
```

We also recomend pyenv installed on the machine to manage the instalation of different python versions.

## Team

- Victor Andres de la Puente - andres.puente@fgv.br
- Juliano Genari - araujo.juliano@fgv.edu.br
- Marcelo Báez - marcelo.baez@fgv.br
- Felipe Moreno-Vera - felipe.moreno@fgv.br
- Jorge Poco - jorge.poco@fgv.br (Corresponding author)

All team members are affiliated with Escola de Matemática Aplicada - Fundação Getúlio Vargas (EMAp - FGV).

## Acknowledgments

This work was completed as part of the Visualization for Machine Learning - Graduate Course (2025.1) by Prof. Jorge Poco at Escola de Matemática Aplicada - Fundação Getúlio Vargas (EMAp - FGV). We thank the VAST Challenge organizers for providing this opportunity to apply visual analytics techniques to real-world problems.