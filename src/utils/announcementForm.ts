import { type AnnouncementValidationIssue } from '../api/announcementService';

export type FieldErrorMap<T extends string> = Partial<Record<T, string>>;

export const buildDigitErrorMessages = <T extends string>(labels: Record<T, string>): Record<T, string> =>
  Object.fromEntries(
    Object.entries(labels).map(([field, label]) => [field, `${label} не може містити цифри`])
  ) as Record<T, string>;

export const mapServerFieldErrors = <T extends string>(
  issues: AnnouncementValidationIssue[] | undefined,
  allowedFields: readonly T[]
): FieldErrorMap<T> => {
  if (!issues?.length) return {};

  const allowed = new Set<T>(allowedFields);

  return issues.reduce<FieldErrorMap<T>>((acc, issue) => {
    if (!issue || typeof issue.message !== 'string' || !issue.message.trim()) return acc;
    if (!Array.isArray(issue.path) || issue.path.length === 0) return acc;

    const field = String(issue.path[issue.path.length - 1]) as T;
    if (!allowed.has(field)) return acc;

    acc[field] = issue.message;
    return acc;
  }, {});
};

export const setNoDigitsFieldValue = <T extends string>({
  field,
  rawValue,
  setValue,
  setSubmitError,
  setFieldErrors,
  digitErrorMessages,
  maxLength,
}: {
  field: T;
  rawValue: string;
  setValue: (value: string) => void;
  setSubmitError: (value: string | null) => void;
  setFieldErrors: (updater: (previous: FieldErrorMap<T>) => FieldErrorMap<T>) => void;
  digitErrorMessages: Record<T, string>;
  maxLength?: number;
}) => {
  const trimmed = rawValue.trimStart();
  const hasDigits = /\d/.test(trimmed);
  const withoutDigits = trimmed.replace(/\d+/g, '');
  const nextValue = typeof maxLength === 'number' ? withoutDigits.slice(0, maxLength) : withoutDigits;

  setValue(nextValue);
  setSubmitError(null);
  setFieldErrors((previous) => {
    const next = { ...previous };
    if (hasDigits) {
      next[field] = digitErrorMessages[field];
    } else {
      delete next[field];
    }
    return next;
  });
};