export type TavernSpec = 'chara_card_v1' | 'chara_card_v2' | 'chara_card_v3' | string;

export type TavernLoreEntry = Record<string, unknown> & {
  keys?: string[];
  secondary_keys?: string[];
  content?: string;
  enabled?: boolean;
  disable?: boolean;
  constant?: boolean;
  selective?: boolean;
  case_sensitive?: boolean;
  use_regex?: boolean;
  insertion_order?: number;
  order?: number;
  position?: string | number;
  depth?: number;
  probability?: number;
  priority?: number;
  group?: string;
  extensions?: Record<string, unknown>;
};

export type TavernCharacterBook = Record<string, unknown> & {
  name?: string;
  description?: string;
  scan_depth?: number;
  token_budget?: number;
  recursive_scanning?: boolean;
  entries: TavernLoreEntry[];
};

export type TavernRegexScript = Record<string, unknown> & {
  id?: string;
  scriptName?: string;
  findRegex?: string;
  replaceString?: string;
  trimStrings?: string[];
  placement?: number[];
  disabled?: boolean;
  markdownOnly?: boolean;
  promptOnly?: boolean;
  substituteRegex?: number;
};

export type TavernCardData = Record<string, unknown> & {
  name: string;
  description: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  creator_notes?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  alternate_greetings?: string[];
  tags?: string[];
  creator?: string;
  character_version?: string;
  character_book?: TavernCharacterBook;
  extensions?: Record<string, unknown>;
};

export type TavernCharacterCard = {
  spec: TavernSpec;
  spec_version?: string;
  data: TavernCardData;
  raw: Record<string, unknown>;
  sourceFormat: 'png-v3' | 'png-v2' | 'png-v1' | 'json-v3' | 'json-v2' | 'json-v1' | 'charx';
  avatar?: string | null;
  embeddedAssets?: Record<string, string>;
  importedAt: string;
};

export type TavernImportResult = {
  card: TavernCharacterCard;
  warnings: string[];
  supported: string[];
};
