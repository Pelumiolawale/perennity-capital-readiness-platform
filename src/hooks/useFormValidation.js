import { useState, useCallback } from 'react';

const RULES = {
  projectName: v => !v?.trim() ? 'Project name is required' : null,
  country: v => !v ? 'Please select a country' : null,
  powerCapacity: v => {
    const n = parseFloat(v);
    if (!v) return 'Power capacity is required';
    if (isNaN(n) || n < 1 || n > 5000) return 'Enter a value between 1 and 5000 MW';
    return null;
  },
  coolingType: v => !v ? 'Please select a cooling technology' : null,
  pueTarget: v => {
    const n = parseFloat(v);
    if (!v) return 'PUE is required';
    if (isNaN(n) || n < 1.0 || n > 3.0) return 'PUE must be between 1.0 and 3.0';
    return null;
  },
  renewablePercent: v => {
    const n = parseFloat(v);
    if (v === '' || v === undefined) return 'Renewable % is required';
    if (isNaN(n) || n < 0 || n > 100) return 'Must be 0–100%';
    return null;
  },
  wueMetric: v => {
    const n = parseFloat(v);
    if (!v) return 'WUE is required';
    if (isNaN(n) || n < 0 || n > 5.0) return 'WUE must be between 0 and 5.0 L/kWh';
    return null;
  },
  serverLifecycle: v => {
    const n = parseInt(v);
    if (!v) return 'Server lifecycle is required';
    if (isNaN(n) || n < 1 || n > 20) return 'Enter a value between 1 and 20 years';
    return null;
  }
};

// Fields required per step
const STEP_REQUIRED_FIELDS = {
  0: ['projectName', 'country', 'powerCapacity', 'coolingType'],
  1: ['pueTarget', 'renewablePercent'],
  2: ['wueMetric'],
  3: ['serverLifecycle'],
  4: []
};

export function useFormValidation() {
  const [errors, setErrors] = useState({});

  const validateField = useCallback((field, value) => {
    const rule = RULES[field];
    if (!rule) return null;
    return rule(value);
  }, []);

  const validateStep = useCallback((stepIndex, formData) => {
    const fields = STEP_REQUIRED_FIELDS[stepIndex] ?? [];
    const stepErrors = {};
    fields.forEach(field => {
      const error = validateField(field, formData[field]);
      if (error) stepErrors[field] = error;
    });
    setErrors(prev => ({ ...prev, ...stepErrors }));
    return Object.keys(stepErrors).length === 0;
  }, [validateField]);

  const clearFieldError = useCallback((field) => {
    setErrors(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  return { errors, validateStep, clearFieldError };
}
