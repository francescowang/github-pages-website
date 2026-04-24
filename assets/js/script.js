'use strict';



// element toggle function
const elementToggleFunc = function (elem) { elem.classList.toggle("active"); }



// sidebar variables
const sidebar = document.querySelector("[data-sidebar]");
const sidebarBtn = document.querySelector("[data-sidebar-btn]");

// sidebar toggle functionality for mobile
if (sidebar && sidebarBtn) {
  sidebarBtn.addEventListener("click", function () { elementToggleFunc(sidebar); });
}



// testimonials variables
const testimonialsItem = document.querySelectorAll("[data-testimonials-item]");
const modalContainer = document.querySelector("[data-modal-container]");
const modalCloseBtn = document.querySelector("[data-modal-close-btn]");
const overlay = document.querySelector("[data-overlay]");

// modal variable
const modalImg = document.querySelector("[data-modal-img]");
const modalTitle = document.querySelector("[data-modal-title]");
const modalText = document.querySelector("[data-modal-text]");

// modal toggle function
const testimonialsModalFunc = function () {
  modalContainer.classList.toggle("active");
  overlay.classList.toggle("active");
}

if (
  testimonialsItem.length &&
  modalContainer &&
  modalCloseBtn &&
  overlay &&
  modalImg &&
  modalTitle &&
  modalText
) {
  // add click event to all modal items
  for (let i = 0; i < testimonialsItem.length; i++) {

    testimonialsItem[i].addEventListener("click", function () {

      modalImg.src = this.querySelector("[data-testimonials-avatar]").src;
      modalImg.alt = this.querySelector("[data-testimonials-avatar]").alt;
      modalTitle.innerHTML = this.querySelector("[data-testimonials-title]").innerHTML;
      modalText.innerHTML = this.querySelector("[data-testimonials-text]").innerHTML;

      testimonialsModalFunc();

    });

  }

  // add click event to modal close button
  modalCloseBtn.addEventListener("click", testimonialsModalFunc);
  overlay.addEventListener("click", testimonialsModalFunc);
}



// custom select variables
const select = document.querySelector("[data-select]");
const selectItems = document.querySelectorAll("[data-select-item]");
const selectValue = document.querySelector("[data-selecct-value]");
const filterBtn = document.querySelectorAll("[data-filter-btn]");

// filter variables
const filterItems = document.querySelectorAll("[data-filter-item]");

const filterFunc = function (selectedValue) {

  for (let i = 0; i < filterItems.length; i++) {

    if (selectedValue === "all") {
      filterItems[i].classList.add("active");
    } else if (selectedValue === filterItems[i].dataset.category) {
      filterItems[i].classList.add("active");
    } else {
      filterItems[i].classList.remove("active");
    }

  }

}

if (select && selectValue && selectItems.length && filterBtn.length && filterItems.length) {
  select.addEventListener("click", function () { elementToggleFunc(this); });

  // add event in all select items
  for (let i = 0; i < selectItems.length; i++) {
    selectItems[i].addEventListener("click", function () {

      let selectedValue = this.innerText.toLowerCase();
      selectValue.innerText = this.innerText;
      elementToggleFunc(select);
      filterFunc(selectedValue);

    });
  }

  // add event in all filter button items for large screen
  let lastClickedBtn = filterBtn[0];

  for (let i = 0; i < filterBtn.length; i++) {

    filterBtn[i].addEventListener("click", function () {

      let selectedValue = this.innerText.toLowerCase();
      selectValue.innerText = this.innerText;
      filterFunc(selectedValue);

      lastClickedBtn.classList.remove("active");
      this.classList.add("active");
      lastClickedBtn = this;

    });

  }
}



// contact form variables
const form = document.querySelector("[data-form]");
const formInputs = document.querySelectorAll("[data-form-input]");
const formBtn = document.querySelector("[data-form-btn]");

if (form && formBtn && formInputs.length) {
  // add event to all form input field
  for (let i = 0; i < formInputs.length; i++) {
    formInputs[i].addEventListener("input", function () {

      // check form validation
      if (form.checkValidity()) {
        formBtn.removeAttribute("disabled");
      } else {
        formBtn.setAttribute("disabled", "");
      }

    });
  }
}



// portfolio data rendering
const renderPortfolioData = function (data) {
  // render about text
  const aboutSection = document.querySelector("[data-about-text]");
  if (aboutSection && data.profile?.about) {
    aboutSection.textContent = data.profile.about;
  }

  // render technologies
  const techList = document.querySelector("[data-tech-list]");
  if (techList && data.technologies?.length) {
    techList.innerHTML = data.technologies.map(function (tech) {
      return `<li class="tag-item">${tech}</li>`;
    }).join("");
  }

  // render work experience
  const workList = document.querySelector("[data-work-list]");
  if (workList && data.experience?.work?.length) {
    workList.innerHTML = data.experience.work.map(function (job) {
      return `
        <li class="timeline-item">
          <h4 class="h4 timeline-item-title">${job.title}</h4>
          <span>${job.period}</span>
        </li>
      `;
    }).join("");
  }

  // render certifications
  const certList = document.querySelector("[data-certifications-list]");
  if (certList && data.experience?.certifications?.length) {
    certList.innerHTML = data.experience.certifications.map(function (cert) {
      return `
        <li class="timeline-item">
          <h4 class="h4 timeline-item-title">${cert.title}</h4>
          <p class="timeline-text">
            ${cert.description}
          </p>
        </li>
      `;
    }).join("");
  }

  // render education
  const educationList = document.querySelector("[data-education-list]");
  if (educationList && data.experience?.education?.length) {
    educationList.innerHTML = data.experience.education.map(function (edu) {
      return `
        <li class="timeline-item">
          <h4 class="h4 timeline-item-title">${edu.institution}</h4>
          <p class="timeline-text">${edu.degree}</p>
        </li>
      `;
    }).join("");
  }

  // render volunteering
  const volunteerList = document.querySelector("[data-volunteering-list]");
  if (volunteerList && data.experience?.volunteering?.length) {
    volunteerList.innerHTML = data.experience.volunteering.map(function (vol) {
      return `
        <li class="timeline-item">
          <h4 class="h4 timeline-item-title">${vol.title}</h4>
          <span>${vol.period}</span>
        </li>
      `;
    }).join("");
  }

  // render hobbies
  const hobbiesList = document.querySelector("[data-hobbies-list]");
  if (hobbiesList && data.experience?.hobbies?.length) {
    hobbiesList.innerHTML = data.experience.hobbies.map(function (hobby) {
      return `
        <li class="timeline-item">
          <h4 class="h4 timeline-item-title">${hobby}</h4>
        </li>
      `;
    }).join("");
  }
};

// fetch and render portfolio data
const portfolioSource = document.body.dataset.portfolioSource;

if (portfolioSource) {
  fetch(portfolioSource, { cache: "no-store" })
    .then(function (response) {
      if (!response.ok) {
        throw new Error("Failed to load portfolio data");
      }
      return response.json();
    })
    .then(function (data) {
      renderPortfolioData(data);
    })
    .catch(function (error) {
      console.error("Error loading portfolio data:", error);
    });
}



// page navigation variables
const navigationLinks = document.querySelectorAll("[data-nav-link]");
const pages = document.querySelectorAll("[data-page]");

const setActivePage = function (pageName) {
  for (let i = 0; i < pages.length; i++) {
    const isActivePage = pageName === pages[i].dataset.page;

    pages[i].classList.toggle("active", isActivePage);
    navigationLinks[i].classList.toggle("active", isActivePage);
  }
}

if (navigationLinks.length && pages.length) {
  // add event to all nav link
  for (let i = 0; i < navigationLinks.length; i++) {
    navigationLinks[i].addEventListener("click", function () {

      const selectedPage = this.innerHTML.toLowerCase();

      setActivePage(selectedPage);
      window.location.hash = selectedPage;
      window.scrollTo(0, 0);

    });
  }

  const requestedPage = window.location.hash.replace("#", "").toLowerCase();

  if (requestedPage) {
    setActivePage(requestedPage);
  }
}