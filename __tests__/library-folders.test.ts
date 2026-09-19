import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { initDb, getSetting, setSetting } from "@/lib/db";
import {
  addLibraryFolder,
  getLibraryFolders,
  getLibraryRoots,
  isWithinFolder,
  normalizeFolders,
  saveLibraryFolders,
} from "@/lib/library-folders";

const TEST_DB = path.join(__dirname, "test-library-folders.db");

describe("library folders", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    initDb(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  });

  it("reads the legacy library_path setting as the primary folder", () => {
    setSetting(db, "library_path", "/movies");
    expect(getLibraryFolders(db)).toEqual({ primary: "/movies", extras: [] });
    expect(getLibraryRoots(db)).toEqual(["/movies"]);
  });

  it("makes the first added folder the primary and later ones extras", () => {
    addLibraryFolder(db, "/a");
    addLibraryFolder(db, "/b");
    expect(getLibraryFolders(db)).toEqual({ primary: "/a", extras: ["/b"] });
    expect(getSetting(db, "library_path")).toBe("/a");
    expect(getLibraryRoots(db)).toEqual(["/a", "/b"]);
  });

  it("does not add the same folder twice, even with a trailing slash", () => {
    addLibraryFolder(db, "/a");
    addLibraryFolder(db, "/a/");
    addLibraryFolder(db, "/b");
    addLibraryFolder(db, "/b/");
    expect(getLibraryFolders(db)).toEqual({ primary: "/a", extras: ["/b"] });
  });

  it("promotes the first extra when the primary is removed", () => {
    saveLibraryFolders(db, { primary: "/a", extras: ["/b", "/c"] });
    saveLibraryFolders(db, { primary: null, extras: ["/b", "/c"] });
    expect(getLibraryFolders(db)).toEqual({ primary: "/b", extras: ["/c"] });
  });

  it("clears both settings when no folders remain", () => {
    saveLibraryFolders(db, { primary: "/a", extras: ["/b"] });
    saveLibraryFolders(db, { primary: null, extras: [] });
    expect(getSetting(db, "library_path")).toBeNull();
    expect(getSetting(db, "library_extra_paths")).toBeNull();
  });

  it("ignores a corrupt extras value", () => {
    setSetting(db, "library_path", "/a");
    setSetting(db, "library_extra_paths", "not json");
    expect(getLibraryFolders(db)).toEqual({ primary: "/a", extras: [] });
  });

  it("normalizeFolders trims, drops blanks and keeps the primary out of extras", () => {
    expect(normalizeFolders(" /a ", ["/a", "  ", "/b", "/b/"])).toEqual({
      primary: "/a",
      extras: ["/b"],
    });
  });

  it("isWithinFolder matches the folder itself and children but not siblings", () => {
    expect(isWithinFolder("/movies", "/movies")).toBe(true);
    expect(isWithinFolder("/movies", "/movies/Dune [2021]/Dune.mkv")).toBe(true);
    expect(isWithinFolder("/movies", "/movies-archive/x.mkv")).toBe(false);
  });
});
