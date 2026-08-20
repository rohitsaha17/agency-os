/**
 * The mark that stands for a creative type — a Reel, a Post, a Photo Shoot.
 *
 * These used to render as emoji pulled from `creativeType.icon`. Emoji draw
 * differently on every platform, don't inherit the type's colour, and read as
 * decoration in a tool people use all day. Each type already carries a colour,
 * so the colour is the mark: a small filled dot, same size everywhere, legible
 * at 10px in a calendar cell.
 *
 * `size` matches the surrounding text — "sm" inside dense rows, "md" beside a
 * heading.
 */
export function CreativeTypeDot({
  color,
  size = "sm",
  className = "",
}: {
  color?: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const px = size === "md" ? "w-2.5 h-2.5" : "w-2 h-2";
  return (
    <span
      aria-hidden
      className={`${px} rounded-full flex-shrink-0 inline-block ${className}`}
      style={{ backgroundColor: color || "#94a3b8" }}
    />
  );
}
