import { getLang, tr } from '@/i18n';
const ALL_CODES = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO ' +
  'FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE ' +
  'JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO ' +
  'MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW ' +
  'PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM ' +
  'TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ');

const PRIORITY = ['UZ', 'KZ', 'KG', 'TJ', 'TM', 'RU', 'TR', 'CN', 'AE', 'AZ', 'BY', 'DE', 'PL', 'US', 'GB'];

const UZ_NAMES: Record<string, string> = {
  UZ: "O'zbekiston",
  KZ: "Qozog'iston",
  KG: "Qirg'iziston",
  TJ: 'Tojikiston',
  TM: 'Turkmaniston',
  AF: "Afg'oniston",
  RU: 'Rossiya',
  TR: 'Turkiya',
  CN: 'Xitoy',
  AE: 'Birlashgan Arab Amirliklari',
  AZ: 'Ozarbayjon',
  BY: 'Belarus',
  UA: 'Ukraina',
  DE: 'Germaniya',
  PL: 'Polsha',
  IT: 'Italiya',
  FR: 'Fransiya',
  GB: 'Buyuk Britaniya',
  US: 'AQSH',
  IR: 'Eron',
  IN: 'Hindiston',
  PK: 'Pokiston',
  KR: 'Janubiy Koreya',
  JP: 'Yaponiya',
  LV: 'Latviya',
  LT: 'Litva',
  EE: 'Estoniya',
  SA: 'Saudiya Arabistoni',
  GE: 'Gruziya',
  AM: 'Armaniston',
};

function makeNamer(): (code: string) => string {
  const lang = getLang();
  if (lang !== 'uz') {
    try {
      const names = new Intl.DisplayNames([lang], { type: 'region' });
      return (code) => names.of(code) ?? code;
    } catch {
    }
  }
  for (const locale of ['uz', 'en']) {
    try {
      const names = new Intl.DisplayNames([locale], { type: 'region', fallback: 'none' });
      if (names.resolvedOptions().locale.split('-')[0] === locale) {
        return (code) => UZ_NAMES[code] ?? names.of(code) ?? code;
      }
    } catch {
    }
  }
  return (code) => UZ_NAMES[code] ?? code;
}

const nameOf = makeNamer();

export function countryName(code: string | null | undefined): string {
  if (!code) return '';
  return nameOf(code.toUpperCase());
}

export interface CountryOption {
  code: string;
  name: string;
  group: string;
}

const collator = new Intl.Collator(getLang());

export const COUNTRY_OPTIONS: CountryOption[] = [
  ...PRIORITY.map((code) => ({ code, name: countryName(code), group: tr('Asosiy') })),
  ...ALL_CODES.filter((c) => !PRIORITY.includes(c))
    .map((code) => ({ code, name: countryName(code), group: tr('Barcha davlatlar') }))
    .sort((a, b) => collator.compare(a.name, b.name)),
];
