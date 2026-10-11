"use strict";
const picker = new DialogController(document.getElementById("add-dialog"));
document.getElementById("add-card").addEventListener("click", () => picker.open());
document.getElementById("add-sample").addEventListener("click", (event) => {
  const row = document.createElement("article");
  row.className = "result-row";
  const copy = document.createElement("div");
  copy.className = "copy";
  const title = document.createElement("h3");
  title.textContent = "Llanowar Elves";
  const metadata = document.createElement("span");
  metadata.className = "muted";
  metadata.textContent = "Creature · Common";
  copy.append(title, metadata); row.append(copy);
  document.getElementById("sample-cards").append(row);
  document.querySelector("#set header .muted").textContent = "4 cards · 1 pack layout";
  document.getElementById("card-status").textContent = "Llanowar Elves added to this demonstration.";
  event.currentTarget.disabled = true;
  picker.close();
});
new DirtyFormController(document.getElementById("set-details"), { save: async (entries) => {
  await new Promise((resolve) => setTimeout(resolve, 450));
  const name = new Map(entries).get("name");
  document.querySelector("#set h1").textContent = name;
  document.querySelector('[aria-current="page"]').textContent = name;
} });
