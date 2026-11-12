import { z } from 'zod';

export const required = (label?: string) => {
  const msg = label ? `${label} is required` : 'This field is required';
  return z.string({ error: msg }).min(1, msg);
};

export const requiredTrimmed = (label?: string) => {
  const msg = label ? `${label} is required` : 'This field is required';
  return z.string({ error: msg }).trim().min(1, msg);
};
