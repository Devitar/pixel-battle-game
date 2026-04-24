export interface ParsedSprite {
  frame: number;
  category: string;
  name: string;
  isAlias?: boolean;
  aliasOf?: number;
}

export interface ParseResult {
  sprites: ParsedSprite[];
  emptyFrames: number[];
  errors: string[];
}

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseSpriteNames(source: string): ParseResult {
  const lines = source.split(/\r?\n/);
  const primary = new Map<number, { category: string; name: string }>();
  const aliases: Array<{ frame: number; target: number; lineNum: number }> = [];
  const emptyFrames = new Set<number>();
  const errors: string[] = [];
  const seenFrames = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i].trim();
    if (line === '' || line.startsWith('#')) continue;

    const tokens = line.split(/\s+/);
    if (tokens.length < 2) {
      errors.push(`line ${lineNum}: too few tokens ("${line}")`);
      continue;
    }

    const frame = Number.parseInt(tokens[0], 10);
    if (!Number.isInteger(frame) || frame < 0 || String(frame) !== tokens[0]) {
      errors.push(`line ${lineNum}: invalid frame index "${tokens[0]}"`);
      continue;
    }

    if (seenFrames.has(frame)) {
      errors.push(`line ${lineNum}: duplicate frame ${frame}`);
      continue;
    }
    seenFrames.add(frame);

    if (tokens[1] === '-') {
      emptyFrames.add(frame);
      continue;
    }

    if (tokens[1] === '=') {
      if (tokens.length < 3) {
        errors.push(`line ${lineNum}: alias missing target frame`);
        continue;
      }
      const target = Number.parseInt(tokens[2], 10);
      if (!Number.isInteger(target) || target < 0 || String(target) !== tokens[2]) {
        errors.push(`line ${lineNum}: invalid alias target "${tokens[2]}"`);
        continue;
      }
      aliases.push({ frame, target, lineNum });
      continue;
    }

    if (tokens.length < 3) {
      errors.push(`line ${lineNum}: expected "<frame> <category> <name>"`);
      continue;
    }
    const category = tokens[1];
    const name = tokens[2];
    if (!IDENT_RE.test(category)) {
      errors.push(`line ${lineNum}: category "${category}" must match ${IDENT_RE}`);
      continue;
    }
    if (!IDENT_RE.test(name)) {
      errors.push(`line ${lineNum}: name "${name}" must match ${IDENT_RE}`);
      continue;
    }
    primary.set(frame, { category, name });
  }

  const seenInCategory = new Map<string, Map<string, number>>();
  for (const [frame, { category, name }] of primary) {
    let byName = seenInCategory.get(category);
    if (!byName) {
      byName = new Map();
      seenInCategory.set(category, byName);
    }
    const existing = byName.get(name);
    if (existing !== undefined) {
      errors.push(
        `duplicate name "${category}.${name}": frames ${existing} and ${frame}`,
      );
    } else {
      byName.set(name, frame);
    }
  }

  const sprites: ParsedSprite[] = [];
  for (const [frame, { category, name }] of primary) {
    sprites.push({ frame, category, name });
  }
  for (const { frame, target, lineNum } of aliases) {
    const targetSprite = primary.get(target);
    if (!targetSprite) {
      errors.push(`line ${lineNum}: alias frame ${frame} -> ${target} (target not found)`);
      continue;
    }
    sprites.push({
      frame,
      category: targetSprite.category,
      name: targetSprite.name,
      isAlias: true,
      aliasOf: target,
    });
  }

  sprites.sort((a, b) => a.frame - b.frame);

  return {
    sprites,
    emptyFrames: [...emptyFrames].sort((a, b) => a - b),
    errors,
  };
}
