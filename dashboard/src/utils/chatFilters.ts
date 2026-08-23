/**
 * Predicates for the chat list, lifted out of the page component so they can be tested.
 *
 * The module name and `filterChats` signature deliberately mirror the ones upstream
 * introduced later (dashboard/src/utils/chatFilters.ts). When this fork rebases onto that
 * release the conflict lands in one small file with an obvious resolution -- take their
 * filterChats, keep our excludeGroups -- instead of inside the 1200-line page.
 */

/** The fields these predicates read. Narrower than Chat on purpose: it is all they need. */
interface ChatLike {
  id: string;
  name?: string;
  isGroup?: boolean;
}

/** Case-insensitive "does any of these fields contain the query". Absent fields never match. */
const matches = (query: string, ...fields: (string | undefined)[]): boolean => {
  const needle = query.toLowerCase();
  return fields.some(f => (f ?? '').toLowerCase().includes(needle));
};

/** Search box filter: matches the chat's display name or its raw JID. */
export function filterChats<T extends ChatLike>(chats: T[], query: string): T[] {
  return chats.filter(c => matches(query, c.name, c.id));
}

/**
 * Hide group conversations when the operator asks for it.
 *
 * Kept as its own function rather than another argument to filterChats: upstream owns
 * filterChats and will keep changing it, this predicate is ours, and separating them is what
 * keeps a future rebase mechanical.
 *
 * A chat whose `isGroup` is absent counts as NOT a group, so it stays visible. The flag comes
 * from the engine, and of the two possible mistakes -- showing a group that should be hidden,
 * or hiding a private conversation -- only the second one loses a message the operator was
 * waiting for. The visible failure is the safe one.
 */
export function excludeGroups<T extends ChatLike>(chats: T[], exclude: boolean): T[] {
  return exclude ? chats.filter(c => c.isGroup !== true) : chats;
}
