import re

from pathlib import Path

import numpy as np
from minydra import resolved_args
from skimage.io import imread, imsave


def common_shape(imgs, axis):
    """
    Find smallest height or width of all images.
    The value along `axis` will be `None`, the other will be
    the smallest of all values

    Args:
        imgs (list[np.array]): list of images
        axis (int): axis images will be concatenated along

    Returns:
        tuple(int): height, width
    """
    if axis == 0:
        ws = [img.shape[1] for img in imgs]
        return (None, min(ws))

    hs = [img.shape[0] for img in imgs]
    return (min(hs), None)


def crop(img, min_h, min_w):
    """
    Crop image to smallest height or width.
    The `None` value will be kept to the image's dim size,
    the other dimension one will be center-cropped to the
    non-`None` value.

    Args:
        img (np.array): image
        min_h (int): height
        min_w (int): width

    Returns:
        np.array: cropped image
    """
    if min_w is None:
        im_h = img.shape[0]
        center = im_h // 2
        start_h = max([0, center - min_h // 2])
        end_h = min([im_h, center + min_h // 2])

        return img[start_h:end_h, :]

    im_w = img.shape[1]
    center = im_w // 2
    start_w = max([0, center - min_w // 2])
    end_w = min([im_w, center + min_w // 2])

    return img[:, start_w:end_w]


def to_rgb(img):
    """
    Convert RGBA image to RGB.

    Args:
        img (np.array): image

    Returns:
        np.array: RGBA image
    """
    if img.shape[-1] == 4:
        return img[..., :3]

    return img


if __name__ == "__main__":
    # Get arguments
    args = resolved_args()
    files = args.files
    print("Looking for", files)
    out = args.out
    axis = args.axis or 0
    if not out.endswith(".png"):
        out += ".png"
    if isinstance(files, str):
        if args.glob:
            base = Path(files).parent.resolve()
            reg = re.compile(Path(files).name)
            files = sorted(
                [f for f in base.iterdir() if reg.match(f.name)], key=lambda x: x.name
            )
        else:
            files = [files]
    print("Reading", len(files), "images...")
    # Find files
    files = [Path(f).resolve() for f in files if f.exists()]

    # Load images
    imgs = [imread(f) for f in files]
    # Find smallest height and width
    h, w = common_shape(imgs, axis)
    # Crop images
    print("Cropping images...")
    imgs = [to_rgb(crop(img, h, w)) for img in imgs]
    # Concatenate images
    imgs = np.concatenate(imgs, axis=axis)
    # Save output image
    print(f"Writing {out} with shape {imgs.shape}...")

    imsave(out, imgs)
    print("Done.")
