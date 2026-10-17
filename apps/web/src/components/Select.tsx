import React, { useState, useRef, useEffect, useCallback, useMemo, useId } from 'react';
import { createPortal } from 'react-dom';
import { IconChevronDown, IconCheck } from './Icons';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  options?: SelectOption[];
  children?: React.ReactNode;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  className?: string;
  style?: React.CSSProperties;
  containerClassName?: string;
  containerStyle?: React.CSSProperties;
  dropdownClassName?: string;
  dropdownStyle?: React.CSSProperties;
  chevronColor?: string;
  sizeVariant?: 'default' | 'sm';
}

function parseChildrenToOptions(children: React.ReactNode): SelectOption[] {
  const result: SelectOption[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;

    const props = child.props as Record<string, unknown>;
    const typeName = typeof child.type === 'string' ? child.type.toLowerCase() : '';
    if (typeName === 'option' || child.type === 'option') {
      const val = props.value !== undefined ? String(props.value) : '';
      let label = val;
      if (typeof props.children === 'string' || typeof props.children === 'number') {
        label = String(props.children);
      } else if (Array.isArray(props.children)) {
        label = props.children
          .map((c) => (typeof c === 'string' || typeof c === 'number' ? c : ''))
          .join('');
      }
      result.push({
        value: val,
        label: label || val,
        disabled: Boolean(props.disabled),
      });
    }
  });
  return result;
}

export const Select = React.forwardRef<HTMLButtonElement, SelectProps>(({
  id: explicitId,
  name,
  value,
  defaultValue,
  options,
  children,
  onChange,
  onValueChange,
  disabled = false,
  placeholder,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  'aria-describedby': ariaDescribedby,
  className = '',
  style,
  containerClassName = '',
  containerStyle,
  dropdownClassName = '',
  dropdownStyle,
  chevronColor = 'var(--text-secondary, #64748B)',
  sizeVariant = 'default',
  ...rest
}, forwardedRef) => {
  const generatedId = useId();
  const id = explicitId || `select-${generatedId}`;
  const listboxId = `${id}-listbox`;

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const nativeSelectRef = useRef<HTMLSelectElement | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [internalValue, setInternalValue] = useState<string>(
    defaultValue !== undefined ? String(defaultValue) : ''
  );
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  const isControlled = value !== undefined;
  const currentValue = isControlled ? String(value) : internalValue;

  const parsedOptions = useMemo(() => {
    if (options && options.length > 0) {
      return options;
    }
    return parseChildrenToOptions(children);
  }, [options, children]);

  const selectedOption = useMemo(() => {
    return parsedOptions.find((opt) => String(opt.value) === String(currentValue)) || parsedOptions[0];
  }, [parsedOptions, currentValue]);

  const displayLabel = selectedOption ? selectedOption.label : (placeholder || '');

  // Calculate position for the portal menu
  const [menuPosition, setMenuPosition] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    placement: 'bottom' | 'top';
  }>({ left: 0, width: 0, placement: 'bottom' });

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const ESTIMATED_HEIGHT = 240;

    const placement: 'bottom' | 'top' =
      spaceBelow < ESTIMATED_HEIGHT && spaceAbove > spaceBelow ? 'top' : 'bottom';

    if (placement === 'bottom') {
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        placement: 'bottom',
      });
    } else {
      setMenuPosition({
        bottom: viewportHeight - rect.top + 4,
        left: rect.left,
        width: rect.width,
        placement: 'top',
      });
    }
  }, []);

  // Update position on open, window resize, and scroll
  useEffect(() => {
    if (!isOpen) return;

    updatePosition();

    const handleScroll = (event: Event) => {
      if (menuRef.current && menuRef.current.contains(event.target as Node)) {
        return;
      }
      updatePosition();
    };

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen, updatePosition]);

  // Click outside listener
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('touchstart', handleClickOutside, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('touchstart', handleClickOutside, true);
    };
  }, [isOpen]);

  const openDropdown = useCallback(() => {
    const idx = parsedOptions.findIndex((opt) => String(opt.value) === String(currentValue));
    setHighlightedIndex(idx >= 0 ? idx : 0);
    setIsOpen(true);
  }, [parsedOptions, currentValue]);

  // Auto-scroll highlighted item into view
  useEffect(() => {
    if (!isOpen || highlightedIndex < 0 || !menuRef.current) return;
    const itemEl = menuRef.current.querySelector(
      `[data-option-index="${highlightedIndex}"]`
    ) as HTMLElement | null;
    if (itemEl) {
      itemEl.scrollIntoView({ block: 'nearest' });
    }
  }, [isOpen, highlightedIndex]);

  const selectOption = useCallback((nextValue: string) => {
    if (!isControlled) {
      setInternalValue(nextValue);
    }
    setIsOpen(false);
    triggerRef.current?.focus();

    if (onValueChange) {
      onValueChange(nextValue);
    }

    if (onChange) {
      const syntheticEvent = {
        target: {
          value: nextValue,
          name: name || '',
          id: id || '',
        },
        currentTarget: {
          value: nextValue,
          name: name || '',
          id: id || '',
        },
        preventDefault: () => {},
        stopPropagation: () => {},
        persist: () => {},
      } as unknown as React.ChangeEvent<HTMLSelectElement>;

      onChange(syntheticEvent);
    }
  }, [isControlled, name, id, onValueChange, onChange]);

  // Typeahead buffer
  const typeAheadBuffer = useRef<string>('');
  const typeAheadTimer = useRef<number | null>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        openDropdown();
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (e.key === 'Tab') {
      setIsOpen(false);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        for (let i = 1; i <= parsedOptions.length; i++) {
          const nextIdx = (prev + i) % parsedOptions.length;
          if (!parsedOptions[nextIdx].disabled) return nextIdx;
        }
        return prev;
      });
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        for (let i = 1; i <= parsedOptions.length; i++) {
          const nextIdx = (prev - i + parsedOptions.length) % parsedOptions.length;
          if (!parsedOptions[nextIdx].disabled) return nextIdx;
        }
        return prev;
      });
      return;
    }

    if (e.key === 'Home') {
      e.preventDefault();
      const first = parsedOptions.findIndex((opt) => !opt.disabled);
      if (first >= 0) setHighlightedIndex(first);
      return;
    }

    if (e.key === 'End') {
      e.preventDefault();
      for (let i = parsedOptions.length - 1; i >= 0; i--) {
        if (!parsedOptions[i].disabled) {
          setHighlightedIndex(i);
          break;
        }
      }
      return;
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < parsedOptions.length) {
        const opt = parsedOptions[highlightedIndex];
        if (!opt.disabled) {
          selectOption(opt.value);
        }
      }
      return;
    }

    // Typeahead search
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (typeAheadTimer.current) {
        window.clearTimeout(typeAheadTimer.current);
      }
      typeAheadBuffer.current += e.key.toLowerCase();
      typeAheadTimer.current = window.setTimeout(() => {
        typeAheadBuffer.current = '';
      }, 500);

      const query = typeAheadBuffer.current;
      const matchIdx = parsedOptions.findIndex(
        (opt) => !opt.disabled && opt.label.toLowerCase().startsWith(query)
      );
      if (matchIdx >= 0) {
        setHighlightedIndex(matchIdx);
      }
    }
  };

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (disabled) return;
    if (isOpen) {
      setIsOpen(false);
    } else {
      openDropdown();
    }
  };

  return (
    <div
      className={`select-wrapper ${sizeVariant === 'sm' ? 'select-wrapper-sm' : ''} ${disabled ? 'select-wrapper-disabled' : ''} ${containerClassName}`.trim()}
      style={containerStyle}
    >
      <button
        ref={(node) => {
          triggerRef.current = node;
          if (typeof forwardedRef === 'function') {
            forwardedRef(node);
          } else if (forwardedRef) {
            forwardedRef.current = node;
          }
        }}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        aria-describedby={ariaDescribedby}
        disabled={disabled}
        className={`select-glass select-trigger ${sizeVariant === 'sm' ? 'select-glass-sm' : ''} ${isOpen ? 'select-open' : ''} ${className}`.trim()}
        style={style}
        onClick={handleTriggerClick}
        onKeyDown={handleKeyDown}
        {...rest}
      >
        <span className="select-trigger-label">{displayLabel}</span>
        <span
          className={`select-chevron ${sizeVariant === 'sm' ? 'select-chevron-sm' : ''} ${isOpen ? 'select-chevron-open' : ''}`}
          aria-hidden="true"
        >
          <IconChevronDown size={sizeVariant === 'sm' ? 13 : 15} color={chevronColor} />
        </span>
      </button>

      {/* Hidden native select for form serialization & programmatic query compatibility */}
      <select
        ref={nativeSelectRef}
        name={name}
        id={`${id}-native`}
        value={currentValue}
        tabIndex={-1}
        aria-hidden="true"
        style={{
          position: 'absolute',
          border: 0,
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          wordWrap: 'normal',
          opacity: 0,
          pointerEvents: 'none',
        }}
        onChange={() => {}}
      >
        {parsedOptions.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Dropdown Menu Portal */}
      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            aria-labelledby={!ariaLabel && id ? id : undefined}
            tabIndex={-1}
            className={`select-dropdown-menu ${sizeVariant === 'sm' ? 'select-dropdown-sm' : ''} ${
              menuPosition.placement === 'top' ? 'select-dropdown-top' : 'select-dropdown-bottom'
            } ${dropdownClassName}`.trim()}
            style={{
              position: 'fixed',
              top: menuPosition.top !== undefined ? `${menuPosition.top}px` : undefined,
              bottom: menuPosition.bottom !== undefined ? `${menuPosition.bottom}px` : undefined,
              left: `${menuPosition.left}px`,
              minWidth: `${menuPosition.width}px`,
              maxWidth: `${Math.max(menuPosition.width, 340)}px`,
              zIndex: 9999,
              ...dropdownStyle,
            }}
            onKeyDown={handleKeyDown}
          >
            {parsedOptions.map((opt, idx) => {
              const isSelected = String(opt.value) === String(currentValue);
              const isHighlighted = highlightedIndex === idx;

              return (
                <div
                  key={opt.value}
                  id={`${listboxId}-opt-${idx}`}
                  role="option"
                  data-option-index={idx}
                  aria-selected={isSelected}
                  aria-disabled={opt.disabled}
                  className={`select-dropdown-item ${isSelected ? 'select-item-selected' : ''} ${
                    isHighlighted ? 'select-item-highlighted' : ''
                  } ${opt.disabled ? 'select-item-disabled' : ''}`.trim()}
                  onClick={() => {
                    if (!opt.disabled) {
                      selectOption(opt.value);
                    }
                  }}
                  onMouseEnter={() => {
                    if (!opt.disabled) {
                      setHighlightedIndex(idx);
                    }
                  }}
                >
                  <span className="select-item-label">{opt.label}</span>
                  {isSelected && (
                    <span className="select-item-check" aria-hidden="true">
                      <IconCheck size={14} color="var(--action-primary, #1A73E8)" />
                    </span>
                  )}
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
});

Select.displayName = 'Select';
