'use strict';

// sidebar toggle for mobile
const sidebar = document.querySelector('[data-sidebar]');
const sidebarBtn = document.querySelector('[data-sidebar-btn]');

if (sidebar && sidebarBtn) {
  sidebarBtn.addEventListener('click', function () {
    sidebar.classList.toggle('active');
    this.setAttribute('aria-expanded', sidebar.classList.contains('active') ? 'true' : 'false');
  });
}



// portfolio data rendering
const renderPortfolioData = (data) => {
  const aboutSection = document.querySelector('[data-about-text]');
  if (aboutSection) {
    if (data.profile?.aboutFile) {
      fetch(data.profile.aboutFile, { cache: 'no-store' })
        .then(res => res.text())
        .then(markdown => { aboutSection.innerHTML = marked.parse(markdown); })
        .catch(err => console.error('Error loading about text:', err));
    } else if (data.profile?.about) {
      aboutSection.textContent = data.profile.about;
    }
  }

  const techList = document.querySelector('[data-tech-list]');
  if (techList && data.technologies?.length) {
    techList.innerHTML = data.technologies.map(tech => `<li class="tag-item">${Utils.escapeHtml(tech)}</li>`).join('');
  }

  const workList = document.querySelector('[data-work-list]');
  if (workList && data.experience?.work?.length) {
    workList.innerHTML = data.experience.work.map(job => `
      <li class="timeline-item">
        <h4 class="h4 timeline-item-title">${Utils.escapeHtml(job.title)}</h4>
        <span>${Utils.escapeHtml(job.period)}</span>
      </li>
    `).join('');
  }

  const certList = document.querySelector('[data-certifications-list]');
  if (certList && data.experience?.certifications?.length) {
    certList.innerHTML = data.experience.certifications.map(cert => `
      <li class="timeline-item">
        <h4 class="h4 timeline-item-title">${Utils.escapeHtml(cert.title)}</h4>
        <p class="timeline-text">${Utils.escapeHtml(cert.description)}${
          cert.credlyUrl ? ` <a href="${Utils.escapeHtml(cert.credlyUrl)}" class="text-link" target="_blank" rel="noopener noreferrer">View on Credly</a>` : ''
        }</p>
      </li>
    `).join('');
  }

  const educationList = document.querySelector('[data-education-list]');
  if (educationList && data.experience?.education?.length) {
    educationList.innerHTML = data.experience.education.map(edu => `
      <li class="timeline-item">
        <h4 class="h4 timeline-item-title">${Utils.escapeHtml(edu.institution)}</h4>
        <p class="timeline-text">${Utils.escapeHtml(edu.degree)}</p>
      </li>
    `).join('');
  }

  const volunteerList = document.querySelector('[data-volunteering-list]');
  if (volunteerList && data.experience?.volunteering?.length) {
    volunteerList.innerHTML = data.experience.volunteering.map(vol => `
      <li class="timeline-item">
        <h4 class="h4 timeline-item-title">${Utils.escapeHtml(vol.title)}</h4>
        <span>${Utils.escapeHtml(vol.period)}</span>
      </li>
    `).join('');
  }

  const hobbiesList = document.querySelector('[data-hobbies-list]');
  if (hobbiesList && data.experience?.hobbies?.length) {
    hobbiesList.innerHTML = data.experience.hobbies.map(hobby => `
      <li class="timeline-item">
        <h4 class="h4 timeline-item-title">${Utils.escapeHtml(hobby)}</h4>
      </li>
    `).join('');
  }

  const softSkillsList = document.querySelector('[data-soft-skills-list]');
  if (softSkillsList && data.experience?.soft_skills?.length) {
    softSkillsList.innerHTML = data.experience.soft_skills.map(skill => `<li class="tag-item">${Utils.escapeHtml(skill)}</li>`).join('');
  }

  const learningList = document.querySelector('[data-learning-list]');
  if (learningList && data.profile?.learning?.length) {
    learningList.innerHTML = data.profile.learning.map(item => `<li class="tag-item">${Utils.escapeHtml(item)}</li>`).join('');
  }

  const languagesList = document.querySelector('[data-languages-list]');
  if (languagesList && data.profile?.languages?.length) {
    languagesList.innerHTML = data.profile.languages.map(lang => `
      <li class="timeline-item">
        <h4 class="h4 timeline-item-title">${Utils.escapeHtml(lang)}</h4>
      </li>
    `).join('');
  }
};

// fetch and render portfolio data
const portfolioSource = document.body.dataset.portfolioSource;
if (portfolioSource) {
  fetch(portfolioSource, { cache: 'no-store' })
    .then(res => {
      if (!res.ok) throw new Error('Failed to load portfolio data');
      return res.json();
    })
    .then(data => renderPortfolioData(data))
    .catch(err => console.error('Error loading portfolio data:', err));
}



// print buttons
document.querySelectorAll('[data-print-btn]').forEach(btn => {
  btn.addEventListener('click', () => window.print());
});



// page navigation
const navigationLinks = document.querySelectorAll('[data-nav-link]');
const pages = document.querySelectorAll('[data-page]');

const setActivePage = (pageName) => {
  pages.forEach(page => page.classList.toggle('active', page.dataset.page === pageName));
  navigationLinks.forEach(link => {
    const isActive = link.dataset.navLink === pageName;
    link.classList.toggle('active', isActive);
    link.setAttribute('aria-current', isActive ? 'page' : 'false');
  });
};

if (navigationLinks.length && pages.length) {
  navigationLinks.forEach(link => {
    link.addEventListener('click', function () {
      setActivePage(this.dataset.navLink);
      window.location.hash = this.dataset.navLink;
      window.scrollTo(0, 0);
    });
  });

  const requestedPage = window.location.hash.replace('#', '').toLowerCase();
  if (requestedPage) setActivePage(requestedPage);
}
