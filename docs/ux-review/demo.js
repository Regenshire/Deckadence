"use strict";
const delay = () => new Promise((resolve) => setTimeout(resolve, 850));
const confirmDialog = new DialogController(document.getElementById("confirm-dialog"));
const detailDialog = new DialogController(document.getElementById("detail-dialog"));
new CollectionController(document.querySelector("[data-collection]"), { confirmDialog, detailDialog });
new DirtyFormController(document.querySelector("[data-dirty-form]"), { save: async () => {
  await delay();
  const failure = document.getElementById("fail-save");
  if (failure.checked) { failure.checked = false; throw new Error("Could not save. Your changes are still here. Try Save changes again."); }
} });
const outputDialog = new DialogController(document.getElementById("output-dialog"));
document.getElementById("open-output").addEventListener("click", () => outputDialog.open());
document.getElementById("output-paper").addEventListener("change", (event) => {
  document.getElementById("output-summary").textContent = `${event.target.value} · 9 cards per sheet · 12 sheets · No backs`;
});
new JobController({ button:document.getElementById("generate-output"), panel:document.getElementById("job-state"), message:document.getElementById("job-message"), progress:document.getElementById("job-progress"), run:async () => {
  await delay();
  if (document.getElementById("fail-output").checked) throw new Error("Could not create the PDF. Your settings are unchanged. Try again.");
  document.getElementById("output-result").textContent = "PDF preparation completed in the demo.";
} });
new NumericEntryController(document.getElementById("mana-demo"), {
  input: document.getElementById("demo-mana"), error: document.getElementById("mana-error"),
  onSubmit: (value) => { document.getElementById("mana-result").textContent = `Mana value ${value} selected. Demo only — no card drawn.`; },
});
