import torch
import torch.nn.functional as F

# --- NEW CLASS NAME ---
class ImageBatcherByIndexProV2:
    """
    (V2) A ComfyUI node that creates a batch of images with advanced features.
    - This version supports both single images and input batches.
    - User specifies max_frames for the output batch.
    - For each input image (up to 6), user can specify its start position (frame_index)
      and mask behavior (mask_as_image_area_is_black or white).
    - The 'repeat_count' parameter has dual functionality:
        - If the input is a single image (batch size 1), 'repeat_count' dictates
          how many times that single image is repeated.
        - If the input is a batch of images (batch size > 1), 'repeat_count'
          specifies how many images to take sequentially from that input batch.
    - Output resolution is determined by the first connected input image.
    - Frames not filled by an input image will be RGB(127,127,127).
    - Outputs 'output_batch' and 'batch_masks'.
    """

    MASK_BEHAVIOR_OPTIONS = ["IMAGE_AREA_IS_BLACK", "IMAGE_AREA_IS_WHITE"]

    @classmethod
    def INPUT_TYPES(s):
        inputs = {
            "required": {
                "max_frames": ("INT", {"default": 50, "min": 1, "max": 8192, "step": 1, "display": "number"}),
            },
            "optional": {}
        }
        for i in range(1, 7):
            inputs["optional"][f"image_{i}"] = ("IMAGE",)
            inputs["optional"][f"frame_index_{i}"] = ("INT", {"default": i, "min": 1, "max": 8192, "step": 1, "display": "number"})
            inputs["optional"][f"repeat_count_{i}"] = ("INT", {"default": 1, "min": 1, "max": 8192, "step": 1, "display": "number"})
            inputs["optional"][f"mask_behavior_{i}"] = (s.MASK_BEHAVIOR_OPTIONS, {"default": s.MASK_BEHAVIOR_OPTIONS[0]})
        return inputs

    RETURN_TYPES = ("IMAGE", "IMAGE",)
    RETURN_NAMES = ("output_batch", "batch_masks",)
    FUNCTION = "create_batch_pro"
    CATEGORY = "utils/batching"

    def _prepare_color_frame(self, color_tuple, target_h, target_w, target_c, dtype, device):
        color_tensor = torch.tensor(color_tuple, dtype=dtype, device=device)
        return color_tensor.reshape(1, 1, target_c).expand(target_h, target_w, target_c)

    def _process_single_image(self, image_b1hwc, target_h, target_w, target_c, dtype, device):
        current_image_orig = image_b1hwc
        if current_image_orig.shape[3] != target_c:
            current_image_adapted = torch.zeros((1, target_h, target_w, target_c), dtype=dtype, device=device)
            common_channels = min(current_image_orig.shape[3], target_c)
            temp_resized = F.interpolate(current_image_orig.permute(0, 3, 1, 2), size=(target_h, target_w), mode='bilinear', align_corners=False).permute(0, 2, 3, 1)
            current_image_adapted[..., :common_channels] = temp_resized[..., :common_channels]

            if target_c == 4 and current_image_orig.shape[3] < 4:
                current_image_adapted[..., 3] = 1.0
            elif target_c == 1 and current_image_orig.shape[3] > 1:
                current_image_adapted[..., 0] = temp_resized[..., :3].mean(dim=3)
            current_image_orig = current_image_adapted

        if current_image_orig.shape[1] != target_h or current_image_orig.shape[2] != target_w:
            img_to_resize_permuted = current_image_orig.permute(0, 3, 1, 2)
            resized_permuted = F.interpolate(img_to_resize_permuted, size=(target_h, target_w), mode='bilinear', align_corners=False)
            processed_image = resized_permuted.permute(0, 2, 3, 1)[0]
        else:
            processed_image = current_image_orig[0]
        return processed_image

    def create_batch_pro(self, max_frames, **kwargs):
        target_h, target_w, target_c = -1, -1, -1
        first_valid_image_tensor = None
        base_dtype = torch.float32
        base_device = 'cpu'

        for i in range(1, 7):
            img_tensor = kwargs.get(f"image_{i}")
            if img_tensor is not None:
                first_valid_image_tensor = img_tensor
                target_h, target_w, target_c = img_tensor.shape[1], img_tensor.shape[2], img_tensor.shape[3]
                base_dtype = img_tensor.dtype
                base_device = img_tensor.device
                break

        if first_valid_image_tensor is None:
            empty_img = torch.empty(0, 1, 1, 3, dtype=base_dtype, device=base_device)
            return (empty_img, empty_img,)

        fill_value_rgb_norm = 127.0 / 255.0
        fill_color_tuple = (fill_value_rgb_norm,) * min(target_c, 3)
        white_color_tuple = (1.0,) * min(target_c, 3)
        black_color_tuple = (0.0,) * min(target_c, 3)
        if target_c > 3:
            fill_color_tuple += (1.0,)
            white_color_tuple += (1.0,)
            black_color_tuple += (1.0,)

        fill_frame = self._prepare_color_frame(fill_color_tuple, target_h, target_w, target_c, base_dtype, base_device)
        white_frame_mask = self._prepare_color_frame(white_color_tuple, target_h, target_w, target_c, base_dtype, base_device)
        black_frame_mask = self._prepare_color_frame(black_color_tuple, target_h, target_w, target_c, base_dtype, base_device)

        output_batch = torch.empty((max_frames, target_h, target_w, target_c), dtype=base_dtype, device=base_device)
        output_batch[:] = fill_frame
        batch_masks = torch.empty((max_frames, target_h, target_w, target_c), dtype=base_dtype, device=base_device)
        batch_masks[:] = white_frame_mask

        for i in range(1, 7):
            img_tensor = kwargs.get(f"image_{i}")
            if img_tensor is None: continue

            frame_index_user = kwargs.get(f"frame_index_{i}", i)
            repeat_count = kwargs.get(f"repeat_count_{i}", 1)
            mask_behavior = kwargs.get(f"mask_behavior_{i}", self.MASK_BEHAVIOR_OPTIONS[0])
            start_idx = frame_index_user - 1
            chosen_mask_frame = black_frame_mask if mask_behavior == self.MASK_BEHAVIOR_OPTIONS[0] else white_frame_mask
            
            input_batch_size = img_tensor.shape[0]

            if input_batch_size > 1:
                num_frames_to_take = min(repeat_count, input_batch_size)
                print(f"V2 Node: Input image_{i} is a batch of {input_batch_size}. Taking {num_frames_to_take} frames starting at index {frame_index_user}.")
                
                for j in range(num_frames_to_take):
                    current_actual_idx = start_idx + j
                    if not (0 <= current_actual_idx < max_frames): break
                    image_to_process = img_tensor[j].unsqueeze(0)
                    processed_image = self._process_single_image(image_to_process, target_h, target_w, target_c, base_dtype, base_device)
                    output_batch[current_actual_idx] = processed_image
                    batch_masks[current_actual_idx] = chosen_mask_frame
            else:
                print(f"V2 Node: Input image_{i} is a single image. Repeating {repeat_count} times starting at index {frame_index_user}.")
                image_to_process = img_tensor[0].unsqueeze(0)
                processed_image = self._process_single_image(image_to_process, target_h, target_w, target_c, base_dtype, base_device)

                for j in range(repeat_count):
                    current_actual_idx = start_idx + j
                    if not (0 <= current_actual_idx < max_frames): break
                    output_batch[current_actual_idx] = processed_image
                    batch_masks[current_actual_idx] = chosen_mask_frame

        return (output_batch, batch_masks,)

# --- ComfyUI Boilerplate with NEW NAMES ---
NODE_CLASS_MAPPINGS = {
    "ImageBatcherByIndexProV2": ImageBatcherByIndexProV2
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "ImageBatcherByIndexProV2": "Image Batcher by Index Pro V2"
}