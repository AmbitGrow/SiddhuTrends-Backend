import AgeGroup from "../models/ageGroup.model.js";

export const seedAgeGroups = async () => {
  const count = await AgeGroup.countDocuments();

  if (count > 0) {
    console.log("Age groups already seeded");
    return;
  }

  const ageGroups = [
    { label: "0–12m", minAge: 0, maxAge: 12, unit: "months" },
    { label: "1–2y", minAge: 1, maxAge: 2, unit: "years" },
    { label: "3–5y", minAge: 3, maxAge: 5, unit: "years" },
    { label: "6–8y", minAge: 6, maxAge: 8, unit: "years" },
    { label: "9–12y", minAge: 9, maxAge: 12, unit: "years" }
  ];

  await AgeGroup.insertMany(ageGroups);
  console.log("Default age groups seeded");
};
