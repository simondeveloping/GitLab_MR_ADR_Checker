/** Werkzeugbeschreibungen für die Chat-Completions-Schnittstelle. */
export const LOCATOR_TOOLS = [
  {
    name: "list_files",
    description:
      "Listet alle Dateien unterhalb eines Verzeichnisses, relativ zur Repository-Wurzel. Ohne Argument die gesamte Wurzel.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Verzeichnis relativ zur Repository-Wurzel, z. B. 'src/services'.",
        },
      },
    },
  },
  {
    name: "grep",
    description:
      "Sucht einen regulaeren Ausdruck im Repository und liefert Treffer als 'pfad:zeile: inhalt'. Optionaler Pfad-Filter grenzt die Suche ein.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Regulaerer Ausdruck (JavaScript-Syntax).",
        },
        path: {
          type: "string",
          description: "Datei oder Verzeichnis, auf das die Suche beschraenkt wird.",
        },
        ignore_case: {
          type: "boolean",
          description: "Gross-/Kleinschreibung ignorieren.",
        },
      },
      required: ["pattern"],
    },
  },
];

export const READER_TOOLS = [
  {
    name: "read_file",
    description:
      "Liest einen Zeilenbereich einer Datei mit Zeilennummern. Ohne Bereich die ersten 400 Zeilen.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Pfad relativ zur Repository-Wurzel." },
        start_line: { type: "integer", description: "Erste Zeile (1-basiert)." },
        end_line: { type: "integer", description: "Letzte Zeile (einschliesslich)." },
        revision: { type: "string", enum: ["base"], description: "Optional: base liest den alten Stand vor dem MR, auch bei gelöschten Dateien. Ohne Angabe aktueller Stand." },
      },
      required: ["path"],
    },
  },
];
