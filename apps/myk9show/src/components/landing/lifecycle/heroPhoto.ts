// The hero photo is a full-width band on phones and tablets, and sits beside the copy at about
// 560px on wide screens (landingSections.css). index.html preloads the same image, and its
// `imagesizes` must equal this value or the browser downloads the photo twice.
export const HERO_PHOTO_SIZES = '(min-width: 1100px) 560px, 100vw';
