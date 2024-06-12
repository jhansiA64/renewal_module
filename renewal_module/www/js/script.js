$("#fixed-form-container .body").hide();
$("#fixed-form-container .button").click(function () {
        $(this).next("#fixed-form-container div").slideToggle(400);
        $(this).toggleClass("expanded");
    });