import { Autocomplete, Box, TextField, Typography } from "@mui/material";
import { COUNTRY_OPTIONS, type CountryOption } from "@/shared/utils/countries";
import { tr } from '@/i18n';

interface Props {
  value: string | null;
  onChange: (code: string | null) => void;
  label?: string;

  onlyCodes?: string[];
  size?: "small" | "medium";
  sx?: object;
}

export default function CountrySelect({
  value,
  onChange,
  label = tr("Davlat"),
  onlyCodes,
  size = "small",
  sx,
}: Props) {
  const options = onlyCodes
    ? COUNTRY_OPTIONS.filter((o) => onlyCodes.includes(o.code)).map((o) => ({
        ...o,
        group: "",
      }))
    : COUNTRY_OPTIONS;
  const selected = options.find((o) => o.code === value) ?? null;

  return (
    <Autocomplete<CountryOption>
      size={size}
      sx={sx}
      options={options}
      value={selected}
      onChange={(_, option) => onChange(option?.code ?? null)}
      groupBy={onlyCodes ? undefined : (o) => o.group}
      getOptionLabel={(o) => o.name}
      isOptionEqualToValue={(a, b) => a.code === b.code}
      filterOptions={(opts, { inputValue }) => {
        const q = inputValue.trim().toLowerCase();
        return q
          ? opts.filter(
              (o) =>
                o.name.toLowerCase().includes(q) || o.code.toLowerCase() === q
            )
          : opts;
      }}
      renderOption={({ key, ...props }, o) => (
        <Box
          component="li"
          key={`${o.group}-${o.code}`}
          {...props}
          sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}
        >
          <span>{o.name}</span>
          <Typography variant="caption" color="text.secondary">
            {o.code}
          </Typography>
        </Box>
      )}
      renderInput={(params) => <TextField {...params} label={label} />}
    />
  );
}
