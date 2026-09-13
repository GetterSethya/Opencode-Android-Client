import { type SetStateAction, useCallback, useState } from 'react';

type UseControllableStateParams<T> = {
  prop?: T;
  defaultProp?: T;
  onChange?: (state: T) => void;
};

type SetStateFn<T> = (prevState?: T) => T;

export function useControllableState<T>({
  prop,
  defaultProp,
  onChange,
}: UseControllableStateParams<T>) {
  const [uncontrolledProp, setUncontrolledProp] = useState<T | undefined>(defaultProp);
  const isControlled = prop !== undefined;
  const value = isControlled ? prop : uncontrolledProp;

  const setValue = useCallback(
    (nextValue: SetStateAction<T | undefined>) => {
      const valueToSet =
        typeof nextValue === 'function' ? (nextValue as SetStateFn<T>)(value) : nextValue;

      if (!isControlled) {
        setUncontrolledProp(valueToSet);
      }

      onChange?.(valueToSet as T);
    },
    [isControlled, onChange, value],
  );

  return [value as T, setValue] as const;
}
