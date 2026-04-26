'use strict';



// element toggle function
const elementToggleFunc = function (elem) { elem.classList.toggle("active"); }



// sidebar toggle for mobile
const sidebar = document.querySelector("[data-sidebar]");
const sidebarBtn = document.querySelector("[data-sidebar-btn]");

if (sidebar && sidebarBtn) {
  sidebarBtn.addEventListener("click", function () {
    elementToggleFunc(sidebar);
    this.setAttribute("aria-expanded", sidebar.classList.contains("active") ? "true" : "false");
  });
}



// portfolio data rendering
const renderPortfolioData = function (data) {
  // render about text
  const aboutSection = document.querySelector("[data-about-text]");
  if (aboutSection) {
    if (data.profile?.aboutFile) {
      // fetch and render markdown file
      fetch(data.profile.aboutFile, { cache: "no-store" })
        .then(response => response.text())
        .then(markdown => {
          aboutSection.innerHTML = marked.parse(markdown);
        })
        .catch(error => console.error("Error loading about text:", error));
    } else if (data.profile?.about) {
      aboutSection.textContent = data.profile.about;
    }
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

  // render soft skills
  const softSkillsList = document.querySelector("[data-soft-skills-list]");
  if (softSkillsList && data.experience?.soft_skills?.length) {
    softSkillsList.innerHTML = data.experience.soft_skills.map(function (skill) {
      return `<li class="tag-item">${skill}</li>`;
    }).join("");
  }

  // render learning
  const learningList = document.querySelector("[data-learning-list]");
  if (learningList && data.profile?.learning?.length) {
    learningList.innerHTML = data.profile.learning.map(function (item) {
      return `<li class="tag-item">${item}</li>`;
    }).join("");
  }

  // render languages
  const languagesList = document.querySelector("[data-languages-list]");
  if (languagesList && data.profile?.languages?.length) {
    languagesList.innerHTML = data.profile.languages.map(function (lang) {
      return `<li class="tag-item">${lang}</li>`;
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
  pages.forEach(function (page) {
    page.classList.toggle("active", page.dataset.page === pageName);
  });
  navigationLinks.forEach(function (link) {
    const isActive = link.dataset.navLink === pageName;
    link.classList.toggle("active", isActive);
    link.setAttribute("aria-current", isActive ? "page" : "false");
  });
}

if (navigationLinks.length && pages.length) {
  // add event to all nav link
  for (let i = 0; i < navigationLinks.length; i++) {
    navigationLinks[i].addEventListener("click", function () {

      const selectedPage = this.dataset.navLink;

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