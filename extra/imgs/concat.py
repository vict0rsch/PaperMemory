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


def concat(imgs, axis, margin):
    """
    Concatenate images along `axis`.

    Args:
        imgs (list[np.array]): list of images
        axis (int): axis images will be concatenated along
        margin (int): margin between images

    Returns:
        np.array: concatenated image
    """
    if margin == 0:
        return np.concatenate(imgs, axis=axis)

    if axis == 0:
        pad = np.zeros((margin, imgs[0].shape[1], 4), dtype=np.uint8)
    else:
        pad = np.zeros((imgs[0].shape[0], margin, 4), dtype=np.uint8)
    pad += np.array([0, 0, 0, 255], dtype=np.uint8)[None, None, :]

    # padding will be transparent so images must be RGBA
    ims = [
        np.concatenate([i, np.ones((*i.shape[:2], 1), dtype=np.uint8) * 255], axis=-1)
        for i in imgs
    ]

    padded = []
    for i in ims[:-1]:
        padded.append(i)
        padded.append(pad)
    padded.append(ims[-1])

    return np.concatenate(padded, axis=axis)


if __name__ == "__main__":
    # Get arguments
    args = resolved_args()
    files = args.files
    print("Looking for", files)

    out = args.out
    axis = args.axis or 0
    margin = args.margin or 0

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
    else:
        files = [Path(f) for f in files]
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
    imgs = concat(imgs, axis, margin)
    # Save output image
    print(f"Writing {out} with shape {imgs.shape}...")

    imsave(out, imgs)
    print("Done.")
