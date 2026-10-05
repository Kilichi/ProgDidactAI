"""Prepara la entrega sin dependencias, secretos, datos ni compilaciones."""

import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


def create_delivery_zip():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", default="Nombre_Apellidos", help="Nombre y apellidos para la entrega")
    arguments = parser.parse_args()
    project_root = Path(__file__).resolve().parent.parent
    artifact_directory = project_root / "artifacts"
    artifact_directory.mkdir(exist_ok=True)
    safe_name = "_".join(arguments.name.split()).replace("/", "_").replace("\\", "_")
    output_path = artifact_directory / f"Extra_ProgDidactAI_{safe_name}.zip"
    excluded_directories = {"node_modules", ".next", ".next-dev", ".git", ".agents", ".aws", ".codex", "data", "artifacts", "__pycache__"}

    with ZipFile(output_path, "w", ZIP_DEFLATED) as archive:
        for file_path in sorted(project_root.rglob("*")):
            relative_path = file_path.relative_to(project_root)
            if any(part in excluded_directories for part in relative_path.parts):
                continue
            if not file_path.is_file() or file_path.name.startswith(".env") and file_path.name != ".env.example":
                continue
            if file_path.suffix in {".zip", ".log"}:
                continue
            archive.write(file_path, Path("ProgDidactAI") / relative_path)

    print(output_path)


if __name__ == "__main__":
    create_delivery_zip()
