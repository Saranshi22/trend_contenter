import React from 'react';
import { IconChevronDown } from './Icons';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options?: SelectOption[];
  containerStyle?: React.CSSProperties;
  containerClassName?: string;
  chevronColor?: string;
  sizeVariant?: 'default' | 'sm';
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({
  options,
  children,
  className = '',
  style,
  containerStyle,
  containerClassName = '',
  chevronColor = 'var(--text-secondary)',
  sizeVariant = 'default',
  disabled,
  ...rest
}, ref) => {
  return (
    <div
      className={`select-wrapper ${sizeVariant === 'sm' ? 'select-wrapper-sm' : ''} ${disabled ? 'select-wrapper-disabled' : ''} ${containerClassName}`.trim()}
      style={containerStyle}
    >
      <select
        ref={ref}
        disabled={disabled}
        className={`select-glass ${sizeVariant === 'sm' ? 'select-glass-sm' : ''} ${className}`.trim()}
        style={style}
        {...rest}
      >
        {options ? options.map(opt => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        )) : children}
      </select>
      <span className="select-chevron" aria-hidden="true">
        <IconChevronDown size={sizeVariant === 'sm' ? 13 : 15} color={chevronColor} />
      </span>
    </div>
  );
});

Select.displayName = 'Select';
