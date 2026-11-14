import { describe, expect, it } from "vitest";
import { photoAtWidth, photoSrcSet } from "@/lib/photo-size";

describe("photoAtWidth", () => {
  it("resizes a Wikimedia thumbnail", () => {
    expect(photoAtWidth("https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Riyadh_Skyline.jpg/2400px-Riyadh_Skyline.jpg", 960))
      .toBe("https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Riyadh_Skyline.jpg/960px-Riyadh_Skyline.jpg");
  });
  it("keeps the query string and the thumb host", () => {
    expect(photoAtWidth("https://thumb.wikimedia.org/wikipedia/commons/thumb/2/20/Riyadh_Skyline.jpg/3840px-Riyadh_Skyline.jpg?utm_source=x", 500))
      .toBe("https://thumb.wikimedia.org/wikipedia/commons/thumb/2/20/Riyadh_Skyline.jpg/500px-Riyadh_Skyline.jpg?utm_source=x");
  });
  it("turns an original into a thumbnail", () => {
    expect(photoAtWidth("https://upload.wikimedia.org/wikipedia/commons/a/a9/Platinum_Tower.jpg", 960))
      .toBe("https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Platinum_Tower.jpg/960px-Platinum_Tower.jpg");
  });
  it("leaves other URLs alone", () => {
    expect(photoAtWidth("/guides/lisbon.jpg", 960)).toBe("/guides/lisbon.jpg");
    expect(photoAtWidth("https://example.com/a.jpg", 960)).toBe("https://example.com/a.jpg");
    expect(photoSrcSet("https://example.com/a.jpg")).toBeUndefined();
  });
  it("builds a srcset", () => {
    expect(photoSrcSet("https://upload.wikimedia.org/wikipedia/commons/a/a9/P.jpg")).toBe([500, 960, 1920].map(w => `https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/P.jpg/${w}px-P.jpg ${w}w`).join(", "));
  });
});
