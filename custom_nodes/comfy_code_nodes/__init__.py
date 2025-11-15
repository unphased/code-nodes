"""Expose the custom nodes to ComfyUI."""

from .python_code_node import PythonCodeNode
from .shell_code_node import ShellCodeNode

NODE_CLASS_MAPPINGS = {
    "ShellCodeNode": ShellCodeNode,
    "PythonCodeNode": PythonCodeNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ShellCodeNode": "Shell Code",
    "PythonCodeNode": "Python Code",
}

__all__ = [
    "ShellCodeNode",
    "PythonCodeNode",
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
]

