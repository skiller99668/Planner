// The six-dot drag handle, shared by every sortable list (tasks, courses,
// term folders). One copy: two drawings of the same handle drift.

export default function IconGrip() {
  return (
    <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor" aria-hidden>
      <circle cx="1.6" cy="2.4" r="1.15" />
      <circle cx="6.4" cy="2.4" r="1.15" />
      <circle cx="1.6" cy="7" r="1.15" />
      <circle cx="6.4" cy="7" r="1.15" />
      <circle cx="1.6" cy="11.6" r="1.15" />
      <circle cx="6.4" cy="11.6" r="1.15" />
    </svg>
  )
}
