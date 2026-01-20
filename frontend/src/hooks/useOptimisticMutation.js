import { useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * useOptimisticMutation - A wrapper hook for mutations with optimistic updates
 *
 * Consolidates the repeated pattern of:
 * 1. Cancel queries before mutation
 * 2. Save previous data
 * 3. Apply optimistic update
 * 4. Rollback on error
 * 5. Invalidate queries on settle
 *
 * @param {Object} options
 * @param {Function} options.mutationFn - The mutation function
 * @param {Array|Function} options.queryKey - Query key for optimistic update (can be function receiving variables)
 * @param {Function} options.optimisticUpdate - Function to update cache optimistically: (old, variables) => newData
 * @param {Array} options.invalidateKeys - Static query keys to invalidate on success
 * @param {Function} options.getInvalidateKeys - Dynamic function to get keys to invalidate: (variables) => [[key1], [key2]]
 * @param {Function} options.onSuccess - Optional success callback: (data, variables, context) => void
 * @param {Function} options.onError - Optional error callback (runs before rollback): (error, variables, context) => void
 */
export function useOptimisticMutation({
  mutationFn,
  queryKey,
  optimisticUpdate,
  invalidateKeys = [],
  getInvalidateKeys,
  onSuccess,
  onError,
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,

    onMutate: optimisticUpdate ? async (variables) => {
      // Resolve the query key (can be function or array)
      const key = typeof queryKey === 'function' ? queryKey(variables) : queryKey;

      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: key });

      // Snapshot the previous value
      const previous = queryClient.getQueryData(key);

      // Optimistically update
      queryClient.setQueryData(key, (old) => optimisticUpdate(old, variables));

      // Return context with previous value for rollback
      return { previous, queryKey: key };
    } : undefined,

    onError: (error, variables, context) => {
      // Call custom error handler first
      if (onError) {
        onError(error, variables, context);
      }

      // Rollback to previous value
      if (context?.previous !== undefined) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
    },

    onSuccess: (data, variables, context) => {
      if (onSuccess) {
        onSuccess(data, variables, context);
      }
    },

    onSettled: (data, error, variables) => {
      // Resolve and invalidate the primary query key
      const key = typeof queryKey === 'function' ? queryKey(variables) : queryKey;
      if (key) {
        queryClient.invalidateQueries({ queryKey: key });
      }

      // Invalidate static additional keys
      invalidateKeys.forEach(k => {
        queryClient.invalidateQueries({ queryKey: k });
      });

      // Invalidate dynamic keys
      if (getInvalidateKeys) {
        const dynamicKeys = getInvalidateKeys(variables);
        dynamicKeys.forEach(k => {
          queryClient.invalidateQueries({ queryKey: k });
        });
      }
    },
  });
}

/**
 * useSimpleMutation - A mutation without optimistic updates
 *
 * Just handles the mutation and invalidates queries on success.
 *
 * @param {Object} options
 * @param {Function} options.mutationFn - The mutation function
 * @param {Array} options.invalidateKeys - Static query keys to invalidate on success
 * @param {Function} options.getInvalidateKeys - Dynamic function to get keys to invalidate: (variables) => [[key1], [key2]]
 * @param {Function} options.onSuccess - Optional success callback
 */
export function useSimpleMutation({
  mutationFn,
  invalidateKeys = [],
  getInvalidateKeys,
  onSuccess,
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,

    onSuccess: (data, variables, context) => {
      // Invalidate static keys
      invalidateKeys.forEach(k => {
        queryClient.invalidateQueries({ queryKey: k });
      });

      // Invalidate dynamic keys
      if (getInvalidateKeys) {
        const dynamicKeys = getInvalidateKeys(variables);
        dynamicKeys.forEach(k => {
          queryClient.invalidateQueries({ queryKey: k });
        });
      }

      // Call custom success handler
      if (onSuccess) {
        onSuccess(data, variables, context);
      }
    },
  });
}

export default useOptimisticMutation;
