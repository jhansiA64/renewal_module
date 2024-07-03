(function ($) {
    "use strict";

    // Spinner
    var spinner = function () {
        setTimeout(function () {
            if ($('#spinner').length > 0) {
                $('#spinner').removeClass('show');
            }
        }, 1);
    };
    spinner(0);

    //testcode
    // const urlParams= new URLSearchParams(window.location.search);
    //     const dataDisplay = urlParams.get('data');
    //     document.getElementById("displayData").innerText = dataDisplay;
    
    
    
    
    // Initiate the wowjs
    new WOW().init();


    // Sticky Navbar
    $(window).scroll(function () {
        if ($(window).width() > 992) {
            if ($(this).scrollTop() > 45) {
                $('.sticky-top .container').addClass('shadow-sm').css('max-width', '100%');
            } else {
                $('.sticky-top .container').removeClass('shadow-sm').css('max-width', $('.topbar .container').width());
            }
        } else {
            $('.sticky-top .container').addClass('shadow-sm').css('max-width', '100%');
        }
    });


    // Hero Header carousel
    $(".header-carousel").owlCarousel({
        items: 1,
        autoplay: true,
        smartSpeed: 2000,
        center: false,
        dots: false,
        loop: true,
        margin: 0,
        nav : true,
        navText : [
            '<i class="bi bi-arrow-left"></i>',
            '<i class="bi bi-arrow-right"></i>'
        ]
    });



    // Project carousel
    $(".project-carousel").owlCarousel({
        autoplay: true,
        smartSpeed: 1000,
        center: false,
        dots: true,
        loop: true,
        margin: 25,
        nav : false,
        navText : [
            '<i class="bi bi-arrow-left"></i>',
            '<i class="bi bi-arrow-right"></i>'
        ],
        responsiveClass: true,
        responsive: {
            0:{
                items:1
            },
            576:{
                items:1
            },
            768:{
                items:2
            },
            992:{
                items:2
            },
            1200:{
                items:2
            }
        }
    });
	
	
    // testimonial carousel
    $(".customer-carousel").owlCarousel({
        autoplay: true,
        smartSpeed: 1500,
        center: false,
        dots: true,
        loop: true,
        margin: 25,
        nav : false,
        navText : [
            '<i class="bi bi-arrow-left"></i>',
            '<i class="bi bi-arrow-right"></i>'
        ],
        responsiveClass: true,
        responsive: {
            0:{
                items:1
            },
            576:{
                items:2
            },
            768:{
                items:1
            },
            992:{
                items:2
            },
            1200:{
                items:2
            }
        }
    });

    // testimonial carousel
    $(".testimonial-carousel").owlCarousel({
        autoplay: true,
        smartSpeed: 1500,
        center: false,
        dots: true,
        loop: true,
        margin: 25,
        nav : false,
        navText : [
            '<i class="bi bi-arrow-left"></i>',
            '<i class="bi bi-arrow-right"></i>'
        ],
        responsiveClass: true,
        responsive: {
            0:{
                items:1
            },
            576:{
                items:2
            },
            768:{
                items:3
            },
            992:{
                items:4
            },
            1200:{
                items:5
            }
        }
    });


    // Facts counter
    $('[data-toggle="counter-up"]').counterUp({
        delay: 5,
        time: 2000
    });


    
   // Back to top button
   $(window).scroll(function () {
    if ($(this).scrollTop() > 300) {
        $('.back-to-top').fadeIn('slow');
    } else {
        $('.back-to-top').fadeOut('slow');
    }
    });
    $('.back-to-top').click(function () {
        $('html, body').animate({scrollTop: 0}, 1500, 'easeInOutExpo');
        return false;
    });


})(jQuery);



frappe.require([
    '/assets/frappe/js/frappe-web.min.js',
    '/assets/js/website.min.js'
], function() {
    // Your custom JavaScript code here
    document.getElementById('contact-form').addEventListener('submit', function(e) {
        e.preventDefault();
        console.log("sending email")

        var name = document.getElementById('name').value;
        var email = document.getElementById('email').value;
        var phone = document.getElementById('phone').value;
        var subject = document.getElementById('subject').value;
        var message = document.getElementById('message').value;

        frappe.call({
            method: 'renewal_module.www.app.send_contact_email',
            args: {
                name: name,
                email: email,
                phone: phone,
                subject:subject,
                message: message
            },
            callback: function(response) {
                if (response.message === 'success') {
                    frappe.msgprint('Thank you for your message. We will get back to you shortly.');
                    document.getElementById('contact-form').reset();
                } else {
                    frappe.msgprint('There was an error sending your message. Please try again later.');
                }
            }
        });
    });
});

// function toggleBox(element) {
//     var content = element.nextElementSibling;
//     var icon = element.querySelector('i');
//     var card = element.closest('.card1');
//     var header = card.querySelector('.card-header');
//     var button =card.querySelector('.icon-right')
   
   
//     if (content.classList.contains('show')) {
//         // If content is already shown, hide it
//         content.classList.remove('show');
//         icon.classList.remove('fa-circle-chevron-down');
//         icon.classList.add('fa-circle-chevron-up');
//         header.classList.remove('active');
//         button.classList.remove('active');
       
//     } else {
//         // If content is hidden, show it
//         content.classList.add('show');
//         icon.classList.remove('fa-circle-chevron-up');
//         icon.classList.add('fa-circle-chevron-down');
//         header.classList.add('active');
//         button.classList.add('active');
//     }
// }

// Ensure the first card is open when the page loads
// document.addEventListener("DOMContentLoaded", function() {
//     var firstHeader = document.querySelector('.card-header');
//     var firstContent = document.querySelector('.hidden-content');
//     firstHeader.classList.add('active');
//     firstContent.classList.add('show');
//     firstHeader.querySelector('i').classList.remove('fa-circle-chevron-up');
//     firstHeader.querySelector('i').classList.add('fa-circle-chevron-down');
//     button.classList.add('active');
// });

 


