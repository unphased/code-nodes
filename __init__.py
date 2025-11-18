"""Expose the custom nodes to ComfyUI."""

from .python_code_node import PythonCodeNode
from .shell_code_node import ShellCodeNode
from .image_batcher_by_indexz import ImageBatcherByIndexProV2

NODE_CLASS_MAPPINGS = {
    "ShellCodeNode": ShellCodeNode,
    "PythonCodeNode": PythonCodeNode,
    "ImageBatcherByIndexProV2": ImageBatcherByIndexProV2
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ShellCodeNode": "Shell Code",
    "PythonCodeNode": "Python Code",
    "ImageBatcherByIndexProV2": "Image Batcher by Index Pro V2"
}

WEB_DIRECTORY = "./web"

__all__ = [
    "ShellCodeNode",
    "PythonCodeNode",
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "WEB_DIRECTORY",
]
