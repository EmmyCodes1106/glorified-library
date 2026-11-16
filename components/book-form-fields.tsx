export type BookFormValues = {
  title: string;
  author: string;
  year: number | null;
  isbn: string | null;
  category: string | null;
  genres: string[];
  description: string | null;
  shelf: string | null;
  rack: string | null;
  totalCopies: number;
  coverPath: string | null;
};

const inputClass = "field w-full";

export function BookBasicFields({ book }: { book?: BookFormValues }) {
  return (
    <>
      <label className="grid gap-1 text-sm sm:col-span-2">
        <span className="label">Title</span>
        <input
          name="title"
          required
          defaultValue={book?.title ?? ""}
          placeholder="Book title"
          className={inputClass}
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="label">Author</span>
        <input
          name="author"
          required
          defaultValue={book?.author ?? ""}
          placeholder="Author name"
          className={inputClass}
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="label">Publication year</span>
        <input
          name="year"
          required
          inputMode="numeric"
          defaultValue={book?.year ?? ""}
          placeholder="e.g. 1958"
          className={inputClass}
        />
      </label>
    </>
  );
}

export function BookDetailFields({
  book,
  removeCover = false,
}: {
  book?: BookFormValues;
  removeCover?: boolean;
}) {
  return (
    <>
      <label className="grid gap-1 text-sm">
        <span className="label">ISBN</span>
        <input
          name="isbn"
          inputMode="numeric"
          defaultValue={book?.isbn ?? ""}
          placeholder="10 or 13 digits"
          className={inputClass}
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="label">Category</span>
        <input
          name="category"
          defaultValue={book?.category ?? ""}
          placeholder="e.g. Fiction"
          className={inputClass}
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="label">Genres</span>
        <input
          name="genres"
          defaultValue={book?.genres.join(", ") ?? ""}
          placeholder="e.g. Classic, Drama"
          className={inputClass}
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="label">Total copies</span>
        <input
          name="totalCopies"
          type="number"
          min={1}
          max={1000}
          defaultValue={book?.totalCopies ?? 1}
          className={inputClass}
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="label">Shelf</span>
        <input
          name="shelf"
          defaultValue={book?.shelf ?? ""}
          placeholder="e.g. A3"
          className={inputClass}
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="label">Rack</span>
        <input
          name="rack"
          defaultValue={book?.rack ?? ""}
          placeholder="e.g. R2"
          className={inputClass}
        />
      </label>

      <label className="grid gap-1 text-sm sm:col-span-2">
        <span className="label">Description</span>
        <textarea
          name="description"
          rows={3}
          defaultValue={book?.description ?? ""}
          placeholder="Short summary of the book"
          className={inputClass}
        />
      </label>

      <label className="grid gap-1 text-sm sm:col-span-2">
        <span className="label">
          Cover image{" "}
          <span className="text-xs">(JPG, PNG, WebP or GIF, up to 5 MB)</span>
        </span>
        <input
          type="file"
          name="cover"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="field w-full file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1 file:text-sm file:font-medium file:text-foreground"
        />
        {book?.coverPath && (
          <span className="hint">
            {removeCover
              ? "Choose a new file to replace the current cover, or tick below to remove it."
              : "Choose a new file to replace the current cover."}
          </span>
        )}
      </label>

      {removeCover && book?.coverPath && (
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="removeCover" className="h-4 w-4" />
          Remove the current cover
        </label>
      )}
    </>
  );
}

export default function BookFormFields({
  book,
  removeCover = false,
}: {
  book?: BookFormValues;
  removeCover?: boolean;
}) {
  return (
    <>
      <BookBasicFields book={book} />
      <BookDetailFields book={book} removeCover={removeCover} />
    </>
  );
}
