import { describe, expect, it } from "vitest";

import { PAPEIS } from "@/nucleo/autorizacao/publico";

import { papelVinculo } from "./infraestrutura/esquema";

describe("esquema de vinculos", () => {
  it("o enum papel_vinculo do banco e exatamente a lista PAPEIS da autorizacao", () => {
    expect([...papelVinculo.enumValues]).toEqual([...PAPEIS]);
  });
});
