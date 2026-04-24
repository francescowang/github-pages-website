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



// blog posts variables
const blogPostsList = document.querySelector("[data-blog-posts-list]");

const formatBlogPostDate = function (dateValue) {
  const parsedDate = new Date(dateValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return dateValue;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(parsedDate);
}

if (blogPostsList && Array.isArray(window.blogPosts)) {
  const sortedBlogPosts = [...window.blogPosts].sort(function (leftPost, rightPost) {
    return new Date(rightPost.date) - new Date(leftPost.date);
  });

  blogPostsList.innerHTML = sortedBlogPosts.map(function (post) {
    return `
      <li class="blog-post-item">
        <a href="${post.href}">

          <div class="blog-content">

            <div class="blog-meta">
              <p class="blog-category">${post.category}</p>

              <span class="dot"></span>

              <time datetime="${post.date}">${formatBlogPostDate(post.date)}</time>
            </div>

            <h3 class="h3 blog-item-title">${post.title}</h3>

            <p class="blog-text">
              ${post.summary}
            </p>

          </div>

        </a>
      </li>
    `;
  }).join("");
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